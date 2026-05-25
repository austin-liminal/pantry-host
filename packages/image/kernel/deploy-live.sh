#!/usr/bin/env bash
# deploy-live.sh — push a freshly-built custom kernel to a LIVE Pi for testing,
# before committing it to the image. Rollback-safe: backs up config.txt and
# leaves the stock kernel.img in place (restore the .bak via SD-mount if the
# board doesn't come back).
#
#   ./kernel/deploy-live.sh                         # pi@pantry.local, ./work/cache/kernel-out
#   ./kernel/deploy-live.sh pi@pantry2.local        # override the target
#   ./kernel/deploy-live.sh pi@100.x.y.z out-dir    # over Tailscale, explicit dir
#   ./kernel/deploy-live.sh --reboot                # reboot the Pi when done
#
# Requires: SSH access to the Pi (key or password) with passwordless sudo —
# the Pantry image grants `pi` NOPASSWD sudo (see customize.sh). Build the
# artifacts first with build.sh's kernel stage (work/cache/kernel-out/).
#
# Env: SSH_OPTS (extra ssh/scp flags, e.g. '-i ~/.ssh/pantry').

set -euo pipefail

log()  { echo "==> $*"; }
die()  { echo "error: $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_OUT="$SCRIPT_DIR/../work/cache/kernel-out"

REBOOT=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --reboot) REBOOT=1 ;;
    -h|--help) sed -n '2,/^$/p' "$0" | sed 's|^# \{0,1\}||'; exit 0 ;;
    *) ARGS+=("$a") ;;
  esac
done

TARGET="${ARGS[0]:-pi@pantry.local}"
OUT_DIR="${ARGS[1]:-$DEFAULT_OUT}"
# shellcheck disable=SC2206
SSH_FLAGS=(${SSH_OPTS:-})

command -v ssh >/dev/null || die "ssh not found on PATH"
command -v scp >/dev/null || die "scp not found on PATH"

[ -d "$OUT_DIR" ]                       || die "kernel-out dir not found: $OUT_DIR (run build.sh's kernel stage)"
[ -f "$OUT_DIR/kernel-pantry.img" ]     || die "missing $OUT_DIR/kernel-pantry.img"
[ -f "$OUT_DIR/kernelrelease" ]         || die "missing $OUT_DIR/kernelrelease"
KREL="$(tr -d '[:space:]' < "$OUT_DIR/kernelrelease")"
[ -n "$KREL" ]                          || die "empty kernelrelease"
MODDIR="$OUT_DIR/kmod/lib/modules/$KREL"
[ -d "$MODDIR" ]                        || die "module tree missing: $MODDIR"

log "target:  $TARGET"
log "kernel:  $OUT_DIR/kernel-pantry.img ($(du -h "$OUT_DIR/kernel-pantry.img" | cut -f1))"
log "release: $KREL"

# The ${arr[@]+"${arr[@]}"} guard keeps the empty-array expansion safe under
# `set -u` on macOS's bash 3.2.
ssh_pi() { ssh ${SSH_FLAGS[@]+"${SSH_FLAGS[@]}"} "$TARGET" "$@"; }

# 1. Kernel image → /tmp, then sudo-install into /boot/firmware.
log "copying kernel-pantry.img to the Pi"
scp ${SSH_FLAGS[@]+"${SSH_FLAGS[@]}"} "$OUT_DIR/kernel-pantry.img" "$TARGET:/tmp/kernel-pantry.img"
ssh_pi "sudo install -m 0644 /tmp/kernel-pantry.img /boot/firmware/kernel-pantry.img && rm -f /tmp/kernel-pantry.img"

# 2. Modules → /lib/modules/<rel>/ via tar over ssh (root extract = correct owner).
log "streaming modules to /lib/modules/$KREL"
tar -C "$OUT_DIR/kmod/lib/modules" -cf - "$KREL" | ssh_pi "sudo tar -C /lib/modules -xpf -"

# 3. Refresh module dep files on the device.
log "running depmod $KREL on the Pi"
ssh_pi "sudo depmod '$KREL'" || echo "warning: depmod returned non-zero (continuing)"

# 4. config.txt: back up once, then select the custom kernel + auto_initramfs=0.
log "updating /boot/firmware/config.txt (backup → config.txt.bak)"
ssh_pi "sudo sh -s" <<'REMOTE'
set -e
CFG=/boot/firmware/config.txt
[ -f "$CFG.bak" ] || cp -a "$CFG" "$CFG.bak"
# Drop any existing auto_initramfs line (stock Pi OS ships =1) before adding our
# own, so we don't leave a duplicate whose precedence is firmware-dependent.
# Deleting commented copies too keeps this idempotent across re-runs.
sed -i '/^[[:space:]]*#*[[:space:]]*auto_initramfs=/d' "$CFG"
printf '\nauto_initramfs=0\n' >> "$CFG"
grep -q '^kernel=kernel-pantry.img' "$CFG" || printf '\n# Pantry Host custom kernel (stock kernel.img kept as fallback)\nkernel=kernel-pantry.img\n' >> "$CFG"
echo "config.txt now points at:"; grep -E '^(kernel|auto_initramfs)=' "$CFG"
REMOTE

cat <<EOF

Installed kernel-pantry.img + modules and updated config.txt (backup saved to
config.txt.bak). The stock kernel.img is untouched as a fallback.

To test:
  1. Reboot:   ssh $TARGET 'sudo reboot'$( [ "$REBOOT" = 1 ] && echo '   (running now)' )
  2. Wait a couple of minutes for it to come back up.
  3. Measure:  ./verify.sh ${TARGET#*@}
  4. Inspect:  ssh $TARGET 'systemd-analyze; dmesg | grep brcmfmac; rfkill list'

If the Pi doesn't come back, restore the stock kernel without reflashing:
SD-mount the card elsewhere and copy the backup over config.txt:
  cp /Volumes/bootfs/config.txt.bak /Volumes/bootfs/config.txt   # macOS
EOF

if [ "$REBOOT" = 1 ]; then
  log "rebooting $TARGET"
  ssh_pi "sudo reboot" || true
fi
