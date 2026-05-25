#!/usr/bin/env bash
# build-kernel.sh — cross-compile the stripped ARMv6 Pantry Host kernel.
#
# Runs INSIDE the kernel-builder container (see ../Dockerfile.kernel), invoked
# by ../build.sh's kernel stage. Bind mounts (set up by build.sh):
#   /src     ← work/cache/linux        raspberrypi/linux checkout (cached)
#   /out     ← work/cache/kernel-out    staged artifacts (output)
#   /ccache  ← work/cache/ccache        compiler cache (cached)
#
# Env (all optional, with defaults):
#   JOBS             parallel make jobs                  (default: nproc)
#   KERNEL_REPO      git remote                          (default: raspberrypi/linux)
#   KERNEL_REF       branch/tag to build                 (default: rpi-6.12.y)
#   KERNEL_FETCH     "1" to git-fetch the ref before building (default: off)
#   DEFCONFIG        base defconfig                      (default: bcm2835_defconfig)
#   CONFIG_FRAGMENT  Kconfig fragment merged on top      (default: baked-in copy)
#
# Output in /out: kernel-pantry.img (the zImage), kmod/ (modules_install tree),
# kernelrelease (the `uname -r` string), dtbs/ + overlays/ (for optional use;
# the image prefers the stock DTBs — see ../customize.sh).

set -euo pipefail

log() { echo "[build-kernel] $*"; }
die() { echo "[build-kernel] error: $*" >&2; exit 1; }

JOBS="${JOBS:-$(nproc)}"
KERNEL_REPO="${KERNEL_REPO:-https://github.com/raspberrypi/linux}"
KERNEL_REF="${KERNEL_REF:-rpi-6.12.y}"
DEFCONFIG="${DEFCONFIG:-bcm2835_defconfig}"
CONFIG_FRAGMENT="${CONFIG_FRAGMENT:-/usr/local/share/pantry-armv6.config}"

SRC=/src
OUT=/out

[ -d "$SRC" ]            || die "/src not mounted"
[ -d "$OUT" ]            || die "/out not mounted"
[ -f "$CONFIG_FRAGMENT" ] || die "config fragment missing: $CONFIG_FRAGMENT"

# ccache wraps the cross gcc via CROSS_COMPILE: make builds CC as
# "$(CROSS_COMPILE)gcc" → "ccache arm-linux-gnueabihf-gcc".
export CCACHE_DIR=/ccache
export ARCH=arm
export CROSS_COMPILE="ccache arm-linux-gnueabihf-"
ccache --max-size=2G >/dev/null 2>&1 || true

# --- Source tree -----------------------------------------------------------
# Shallow-clone on first run; reuse the cached tree thereafter for fast
# incremental rebuilds. KERNEL_FETCH=1 refreshes the ref (e.g. --force-kernel).
if [ ! -d "$SRC/.git" ]; then
  log "cloning $KERNEL_REPO@$KERNEL_REF (shallow) into $SRC"
  git clone --depth=1 --branch "$KERNEL_REF" "$KERNEL_REPO" "$SRC"
elif [ "${KERNEL_FETCH:-0}" = "1" ]; then
  log "fetching $KERNEL_REF"
  git -C "$SRC" fetch --depth=1 origin "$KERNEL_REF"
  git -C "$SRC" reset --hard FETCH_HEAD
else
  log "reusing cached source tree at $SRC ($(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo '?'))"
fi

cd "$SRC"

# --- Configure: defconfig → merge fragment → resolve -----------------------
log "configuring: $DEFCONFIG + $(basename "$CONFIG_FRAGMENT")"
make -j"$JOBS" "$DEFCONFIG"
# -m merges the fragment into .config without expanding; olddefconfig then
# fills in defaults for everything the fragment didn't pin.
./scripts/kconfig/merge_config.sh -m -O . .config "$CONFIG_FRAGMENT"
make -j"$JOBS" olddefconfig

# Fail loudly if a load-bearing symbol didn't land as built-in (e.g. a base
# defconfig that can't satisfy =y forced it back to =m/n). Catches the
# "bcm2835_defconfig lacks RPi SDIO/brcmfmac" contingency early.
for sym in CONFIG_BRCMFMAC CONFIG_BRCMFMAC_SDIO CONFIG_CFG80211 CONFIG_RFKILL \
           CONFIG_MMC_BCM2835 CONFIG_EXT4_FS CONFIG_VFAT_FS CONFIG_TUN; do
  if ! grep -q "^${sym}=y" .config; then
    echo "[build-kernel] warning: ${sym} is not =y in the resolved .config:" >&2
    grep -E "^(# )?${sym}\b" .config >&2 || echo "  (absent — base defconfig may not support it; consider bcmrpi_defconfig)" >&2
  fi
done

# --- Build -----------------------------------------------------------------
log "building zImage + dtbs + modules (-j$JOBS)"
make -j"$JOBS" zImage dtbs modules

# Read the release string AFTER the build: `make kernelrelease` reads
# include/config/auto.conf, which only picks up our CONFIG_LOCALVERSION once a
# build step has re-run syncconfig. Reading it before the build yields the
# stale defconfig value (no -pantry-v6), which then mismatches the module dir.
KREL="$(make -s kernelrelease)"
log "kernel release: $KREL"

# --- Stage artifacts to /out ----------------------------------------------
log "staging artifacts to $OUT"
rm -rf "$OUT/kmod"
mkdir -p "$OUT/kmod" "$OUT/dtbs" "$OUT/overlays"

install -m 0644 arch/arm/boot/zImage "$OUT/kernel-pantry.img"

# modules_install lays down /lib/modules/<rel>/ under INSTALL_MOD_PATH.
make -j"$JOBS" INSTALL_MOD_PATH="$OUT/kmod" modules_install

# Authoritative release = the dir modules_install actually created. Deriving it
# from disk (rather than trusting $KREL) guards customize.sh/deploy-live.sh
# against any drift between `make kernelrelease` and the installed module path.
KREL="$(ls "$OUT/kmod/lib/modules" | head -n1)"
printf '%s\n' "$KREL" > "$OUT/kernelrelease"

# DTBs + overlays (staged for optional injection; image prefers stock ones).
# 6.12 keeps ARMv6 Broadcom DTBs under broadcom/; overlays under overlays/.
find arch/arm/boot/dts -name 'bcm2*-rpi-*.dtb' -exec cp -f {} "$OUT/dtbs/" \; 2>/dev/null || true
if [ -d arch/arm/boot/dts/overlays ]; then
  find arch/arm/boot/dts/overlays -name '*.dtbo' -exec cp -f {} "$OUT/overlays/" \; 2>/dev/null || true
  [ -f arch/arm/boot/dts/overlays/overlay_map.dtb ] && \
    cp -f arch/arm/boot/dts/overlays/overlay_map.dtb "$OUT/overlays/" || true
fi

log "done:"
log "  kernel-pantry.img  $(du -h "$OUT/kernel-pantry.img" | cut -f1)"
log "  modules            $OUT/kmod/lib/modules/$KREL"
log "  dtbs               $(ls "$OUT/dtbs" | wc -l) file(s)"
