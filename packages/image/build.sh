#!/usr/bin/env bash
# build.sh — produce a flashable Pantry Host SD-card image for the Pi Zero W.
#
#   ./build.sh                # full build: binary + image (cached Pi OS reused)
#   ./build.sh --skip-binary  # reuse packages/server/dist/pi/pantry-server-armv6
#   ./build.sh --skip-pi-os   # require the cached Pi OS image; never download
#   ./build.sh --force-pi-os  # re-download Pi OS even if a cached copy exists
#   ./build.sh --no-kernel    # ship the stock Pi OS kernel (skip the custom kernel)
#   ./build.sh --skip-kernel  # require the cached custom kernel; never (re)build it
#   ./build.sh --force-kernel # fetch + fully rebuild the custom kernel
#   ./build.sh --no-compress  # leave the raw .img next to the .img.xz (faster dd)
#   ./build.sh --no-shrink    # keep the full ~2.4 GB rootfs (skip the shrink step)
#   ./build.sh --keep-old     # keep previous dist/ images (skip the prune step)
#
# Output: packages/image/dist/pantry-host-pi-zero-w-YYYYMMDD-HHMMSS.img(.xz)
#         + matching .sha256
#
# The flashing step is up to the user:
#   xzcat dist/<image>.img.xz | sudo dd of=/dev/diskN bs=4M status=progress
#
# Future captive-portal work replaces the .env.image step with an interactive
# setup on first boot. For now WiFi must be baked in.

set -euo pipefail

# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SERVER_DIR="$REPO_ROOT/packages/server"
WORK_DIR="$SCRIPT_DIR/work"
DIST_DIR="$SCRIPT_DIR/dist"
ENV_FILE="$SCRIPT_DIR/.env.image"
BUILDER_TAG="pantry-host-image-builder:latest"

mkdir -p "$WORK_DIR/cache" "$DIST_DIR"

log()  { echo "==> $*"; }
warn() { echo "warning: $*" >&2; }
die()  { echo "error: $*" >&2; exit 1; }

# Intermediate artifacts to remove on exit (success or failure): the staging
# .img only. work/cache/ (Pi OS download + decompressed raw, Tailscale .deb)
# and the final dist/ outputs are deliberately preserved.
CLEANUP_PATHS=()
cleanup() {
  local rc=$? p
  if [ "${#CLEANUP_PATHS[@]}" -gt 0 ]; then
    for p in "${CLEANUP_PATHS[@]}"; do
      [ -n "$p" ] && rm -f "$p"
    done
  fi
  exit "$rc"
}
trap cleanup EXIT

# Sweep orphaned staging images from prior runs that were killed before their
# own trap could fire (the current run's staging is tracked via CLEANUP_PATHS).
rm -f "$WORK_DIR"/staging-*.img

# Flags ---------------------------------------------------------------------

SKIP_BINARY=0
SKIP_PI_OS=0
FORCE_PI_OS=0
NO_KERNEL=0
SKIP_KERNEL=0
FORCE_KERNEL=0
COMPRESS=1
SHRINK=1
KEEP_OLD=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-binary) SKIP_BINARY=1 ;;
    --skip-pi-os)  SKIP_PI_OS=1 ;;
    --force-pi-os) FORCE_PI_OS=1 ;;
    --no-kernel)   NO_KERNEL=1 ;;
    --skip-kernel) SKIP_KERNEL=1 ;;
    --force-kernel) FORCE_KERNEL=1 ;;
    --no-compress) COMPRESS=0 ;;
    --no-shrink)   SHRINK=0 ;;
    --keep-old)    KEEP_OLD=1 ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's|^# \{0,1\}||'
      exit 0
      ;;
    *) die "unknown flag: $1 (use --help)" ;;
  esac
  shift
done

# .env.image ----------------------------------------------------------------

if [ ! -f "$ENV_FILE" ]; then
  cat >&2 <<EOF
error: $ENV_FILE not found.

This file is gitignored on purpose — it holds your WiFi credentials. Seed
it from the example and edit:

    cp packages/image/.env.image.example packages/image/.env.image
    \$EDITOR packages/image/.env.image

Required: WIFI_SSID, WIFI_PSK, WIFI_COUNTRY, and USER_PASSWORD (or
SSH_AUTHORIZED_KEYS).
EOF
  exit 2
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

: "${WIFI_SSID:?WIFI_SSID required in $ENV_FILE}"
: "${WIFI_PSK:?WIFI_PSK required in $ENV_FILE}"
: "${WIFI_COUNTRY:=US}"
: "${HOSTNAME:=pantry}"
: "${USERNAME:=pi}"
: "${TIMEZONE:=Etc/UTC}"
: "${KEYBOARD_LAYOUT:=us}"

# Dependencies --------------------------------------------------------------

need() { command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"; }
need docker
need curl
need shasum

# Stage 1 — cross-compile pantry-server for ARMv6 ---------------------------

BINARY_PATH="$SERVER_DIR/dist/pi/pantry-server-armv6"
if (( ! SKIP_BINARY )) || [ ! -x "$BINARY_PATH" ]; then
  log "cross-compiling pantry-server (armv6)"
  ( cd "$SERVER_DIR" && ./scripts/build-pi.sh armv6 --no-image --no-verify )
fi
[ -x "$BINARY_PATH" ] || die "expected $BINARY_PATH after build-pi.sh"
log "binary: $BINARY_PATH ($(du -h "$BINARY_PATH" | cut -f1))"

# Stage 1.5 — cross-compile a stripped ARMv6 kernel -------------------------

# WiFi (brcmfmac) + root storage drivers are built into the kernel (=y) so they
# initialize during kernel boot instead of via a ~25s-late udev modprobe —
# pulling WiFi association ~20s earlier on the single ARMv6 core. The build runs
# in its own unprivileged container (Dockerfile.kernel); the source tree and
# ccache live in work/cache/ for fast incremental rebuilds. customize.sh injects
# the result as kernel-pantry.img and leaves the stock kernel.img as a fallback.
#   --no-kernel    ship the stock Pi OS kernel (KERNEL_OUT emptied → no inject)
#   --skip-kernel  reuse the cached artifacts; fail if absent
#   --force-kernel git-fetch the ref and rebuild from scratch
KERNEL_SRC="$WORK_DIR/cache/linux"
KERNEL_OUT="$WORK_DIR/cache/kernel-out"
KERNEL_CCACHE="$WORK_DIR/cache/ccache"
KERNEL_IMG="$KERNEL_OUT/kernel-pantry.img"
KERNEL_BUILDER_TAG="pantry-host-kernel-builder:latest"

if (( SKIP_KERNEL && FORCE_KERNEL )); then
  die "--skip-kernel and --force-kernel are mutually exclusive"
fi

if (( NO_KERNEL )); then
  log "skipping custom kernel (--no-kernel) — image ships the stock Pi OS kernel"
  KERNEL_OUT=""
elif (( SKIP_KERNEL )); then
  [ -f "$KERNEL_IMG" ] || die "--skip-kernel given but no cached kernel at $KERNEL_IMG"
  log "reusing cached custom kernel $KERNEL_IMG ($(du -h "$KERNEL_IMG" | cut -f1))"
else
  mkdir -p "$KERNEL_SRC" "$KERNEL_OUT" "$KERNEL_CCACHE"
  log "building kernel-builder container ($KERNEL_BUILDER_TAG)"
  docker build -t "$KERNEL_BUILDER_TAG" -f "$SCRIPT_DIR/Dockerfile.kernel" "$SCRIPT_DIR"
  log "cross-compiling custom kernel (first run clones + full build; later runs incremental)"
  docker run --rm \
    -v "$KERNEL_SRC:/src" \
    -v "$KERNEL_OUT:/out" \
    -v "$KERNEL_CCACHE:/ccache" \
    -e KERNEL_FETCH="$FORCE_KERNEL" \
    "$KERNEL_BUILDER_TAG"
  [ -f "$KERNEL_IMG" ] || die "expected $KERNEL_IMG after kernel build"
  log "kernel: $KERNEL_IMG ($(du -h "$KERNEL_IMG" | cut -f1)), release $(cat "$KERNEL_OUT/kernelrelease" 2>/dev/null || echo '?')"
fi

# Stage 2 — fetch Raspberry Pi OS Lite (32-bit armhf, Bookworm) -------------

DEFAULT_PI_OS_URL="https://downloads.raspberrypi.com/raspios_lite_armhf_latest"
PI_OS_URL="${PI_OS_URL:-$DEFAULT_PI_OS_URL}"
PI_OS_XZ="$WORK_DIR/cache/raspios-armhf-lite.img.xz"
PI_OS_RAW="$WORK_DIR/cache/raspios-armhf-lite.img"

# The Pi OS image is ~500 MB and immutable for a given release, so it's cached
# in work/cache/ and reused across runs by default — re-downloading every build
# wastes bandwidth and time. Download only when the cache is missing.
# --force-pi-os re-fetches a fresh copy (e.g. to pick up a newer _latest);
# --skip-pi-os insists on the cache and fails loudly if it isn't there.
if (( SKIP_PI_OS && FORCE_PI_OS )); then
  die "--skip-pi-os and --force-pi-os are mutually exclusive"
fi

if [ -f "$PI_OS_XZ" ] && (( ! FORCE_PI_OS )); then
  log "reusing cached Pi OS image $PI_OS_XZ ($(du -h "$PI_OS_XZ" | cut -f1)); pass --force-pi-os to re-download"
elif (( SKIP_PI_OS )); then
  die "--skip-pi-os given but no cached Pi OS image at $PI_OS_XZ"
else
  log "downloading $PI_OS_URL"
  curl -L --fail --retry 3 -o "$PI_OS_XZ" "$PI_OS_URL"
  if [ -n "${PI_OS_SHA256:-}" ]; then
    log "verifying SHA256 against PI_OS_SHA256"
    echo "$PI_OS_SHA256  $PI_OS_XZ" | shasum -a 256 -c -
  else
    # Try to grab the upstream-published checksum. The _latest_ redirector
    # also serves a .sha256 sibling; the per-release URLs do too.
    if curl -L --fail --retry 2 -s -o "$PI_OS_XZ.sha256" "$PI_OS_URL.sha256"; then
      log "verifying SHA256 against upstream $PI_OS_URL.sha256"
      # Some upstream files are "<hash>  <basename>" — rewrite the basename
      # to match our local path so shasum is happy.
      hash="$(awk '{print $1}' "$PI_OS_XZ.sha256")"
      echo "$hash  $PI_OS_XZ" | shasum -a 256 -c -
    else
      warn "no SHA256 available — proceeding without verification"
    fi
  fi
fi

# Reuse the decompressed raw when it's already current with the .img.xz (the
# .tmp→mv below guarantees a present raw is complete). A fresh download bumps
# the .xz mtime past the raw, which re-triggers decompression.
if [ -f "$PI_OS_RAW" ] && [ "$PI_OS_RAW" -nt "$PI_OS_XZ" ]; then
  log "reusing decompressed Pi OS image $PI_OS_RAW"
else
  log "decompressing Pi OS image"
  xz -dc -k "$PI_OS_XZ" > "$PI_OS_RAW.tmp"
  mv "$PI_OS_RAW.tmp" "$PI_OS_RAW"
fi

# Stage 3 — fetch a Tailscale .deb for armhf --------------------------------

TAILSCALE_DEB="$WORK_DIR/cache/tailscale-armhf.deb"
if [ -n "${TAILSCALE_DEB_URL:-}" ]; then
  log "downloading Tailscale deb from $TAILSCALE_DEB_URL"
  curl -L --fail --retry 3 -o "$TAILSCALE_DEB" "$TAILSCALE_DEB_URL"
else
  # Discover the latest stable armhf .deb from Tailscale's apt index.
  # Repo layout: pkgs.tailscale.com/stable/raspbian is the apt repo root
  # ("deb https://pkgs.tailscale.com/stable/raspbian bookworm main") so
  # `bookworm` is the suite name, not a path segment. The Packages file
  # lives at dists/bookworm/main/binary-armhf/.
  #
  # Deliberately broken into discrete steps (curl to file, gunzip, awk) so
  # macOS's bash 3.2 doesn't garble set -e + pipefail + command-substitution
  # semantics — that combination silently exits the script on any sub-failure
  # without printing the trap.
  log "looking up latest Tailscale armhf .deb"
  PKG_BASE="https://pkgs.tailscale.com/stable/raspbian"
  PKG_INDEX_GZ="$PKG_BASE/dists/bookworm/main/binary-armhf/Packages.gz"
  PKG_INDEX_PLAIN="$PKG_BASE/dists/bookworm/main/binary-armhf/Packages"
  PKG_CACHE="$WORK_DIR/cache/tailscale-Packages"

  rm -f "$PKG_CACHE" "$PKG_CACHE.gz"

  log "  GET $PKG_INDEX_GZ"
  set +e
  curl -L --fail --retry 3 -sS -o "$PKG_CACHE.gz" "$PKG_INDEX_GZ"
  curl_gz_rc=$?
  set -e
  if [ "$curl_gz_rc" -eq 0 ] && [ -s "$PKG_CACHE.gz" ]; then
    log "  decompressing Packages.gz"
    gunzip -f "$PKG_CACHE.gz"
  else
    log "  Packages.gz failed (curl exit $curl_gz_rc); trying plain Packages"
    log "  GET $PKG_INDEX_PLAIN"
    curl -L --fail --retry 3 -sS -o "$PKG_CACHE" "$PKG_INDEX_PLAIN"
  fi
  [ -s "$PKG_CACHE" ] || die "tailscale apt index not present at $PKG_CACHE after download"

  TAILSCALE_FILENAME="$(awk '/^Package: tailscale$/{p=1; next} /^Package:/{p=0} p && /^Filename:/{print $2; exit}' "$PKG_CACHE")"
  [ -n "$TAILSCALE_FILENAME" ] || die "no 'Package: tailscale' / 'Filename:' pair in $PKG_CACHE"
  TAILSCALE_DEB_URL="$PKG_BASE/$TAILSCALE_FILENAME"
  log "downloading $TAILSCALE_DEB_URL"
  curl -L --fail --retry 3 -sS -o "$TAILSCALE_DEB" "$TAILSCALE_DEB_URL"
fi
log "tailscale deb: $TAILSCALE_DEB ($(du -h "$TAILSCALE_DEB" | cut -f1))"

# Stage 4 — register binfmt + build the customizer container ----------------

log "registering qemu binfmt handlers on the host (idempotent)"
docker run --rm --privileged tonistiigi/binfmt --install all >/dev/null 2>&1 \
  || warn "binfmt registration returned non-zero — chroot+qemu may fail"

log "building image-customizer container ($BUILDER_TAG)"
docker build -t "$BUILDER_TAG" -f "$SCRIPT_DIR/Dockerfile.builder" "$SCRIPT_DIR"

# Stage 5 — copy to staging .img + customize --------------------------------

STAMP="$(date -u +%Y%m%d-%H%M%S)"
STAGING_IMG="$WORK_DIR/staging-$STAMP.img"
cp "$PI_OS_RAW" "$STAGING_IMG"
# mv'd to dist/ on success; tracked so a failed/aborted run doesn't leak it.
CLEANUP_PATHS+=("$STAGING_IMG")
log "staging image: $STAGING_IMG ($(du -h "$STAGING_IMG" | cut -f1))"

# Hand the built kernel to the customizer when we have one. Built as an array
# so --no-kernel (empty KERNEL_OUT) adds nothing; the ${arr[@]+…} guard keeps
# the empty expansion safe under `set -u` on macOS's bash 3.2.
KERNEL_RUN_ARGS=()
if [ -n "${KERNEL_OUT:-}" ]; then
  KERNEL_RUN_ARGS=( -v "$KERNEL_OUT:/work/kernel:ro" -e KERNEL_DIR=/work/kernel )
fi

# Bind-mount paths into the container. /work/image.img must be the same
# device that the host writes to, so the customized data lands back here.
log "running customizer (this takes a few minutes under QEMU)"
docker run --rm --privileged \
  -v "$STAGING_IMG:/work/image.img" \
  -v "$BINARY_PATH:/work/pantry-server:ro" \
  -v "$TAILSCALE_DEB:/work/tailscale.deb:ro" \
  -v "$SERVER_DIR:/work/server:ro" \
  ${KERNEL_RUN_ARGS[@]+"${KERNEL_RUN_ARGS[@]}"} \
  -e IMAGE_PATH=/work/image.img \
  -e BINARY_PATH=/work/pantry-server \
  -e TAILSCALE_DEB_PATH=/work/tailscale.deb \
  -e SERVER_DIR=/work/server \
  -e SHRINK_ROOTFS="$SHRINK" \
  -e WIFI_SSID="$WIFI_SSID" \
  -e WIFI_PSK="$WIFI_PSK" \
  -e WIFI_COUNTRY="$WIFI_COUNTRY" \
  -e HOSTNAME="$HOSTNAME" \
  -e USERNAME="$USERNAME" \
  -e USER_PASSWORD="${USER_PASSWORD:-}" \
  -e SSH_AUTHORIZED_KEYS="${SSH_AUTHORIZED_KEYS:-}" \
  -e TIMEZONE="$TIMEZONE" \
  -e KEYBOARD_LAYOUT="$KEYBOARD_LAYOUT" \
  "$BUILDER_TAG"

# Stage 6 — move + checksum + (optional) compress ---------------------------

OUT_BASENAME="pantry-host-pi-zero-w-$STAMP"
OUT_IMG="$DIST_DIR/$OUT_BASENAME.img"
mv "$STAGING_IMG" "$OUT_IMG"
( cd "$DIST_DIR" && shasum -a 256 "$OUT_BASENAME.img" > "$OUT_BASENAME.img.sha256" )

FINAL="$OUT_IMG"
if (( COMPRESS )); then
  log "compressing (xz -T0 -6 — multi-threaded, balanced)"
  xz -T0 -6 -f "$OUT_IMG"
  ( cd "$DIST_DIR" && shasum -a 256 "$OUT_BASENAME.img.xz" > "$OUT_BASENAME.img.xz.sha256" )
  FINAL="$OUT_IMG.xz"
fi

# Prune previous builds — now that this run's image (and checksum) is on disk,
# drop every other pantry-host-pi-zero-w-* artifact from dist/. --keep-old skips.
if (( ! KEEP_OLD )); then
  pruned=0
  shopt -s nullglob
  for f in "$DIST_DIR"/pantry-host-pi-zero-w-*; do
    case "$f" in
      "$DIST_DIR/$OUT_BASENAME"*) continue ;;  # keep the build we just made
    esac
    rm -f "$f" && pruned=$((pruned + 1))
  done
  shopt -u nullglob
  (( pruned )) && log "pruned $pruned old build artifact(s) from $DIST_DIR"
fi

# Wrap up -------------------------------------------------------------------

echo
log "done."
ls -lh "$DIST_DIR"/$OUT_BASENAME*
echo
cat <<EOF
Flash it with the companion script (lists candidate disks, verifies the
checksum, unmounts, dd's, and grows the rootfs to fill the card):

    ./flash.sh                 # newest image in dist/, then pick a disk
    ./flash.sh "$FINAL"        # this specific image

For manual 'dd' instructions and all options: ./flash.sh --help
Then plug the card into the Pi and power on — see the README ("First boot")
for what to expect.
EOF
