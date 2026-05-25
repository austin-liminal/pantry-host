#!/usr/bin/env bash
# flash.sh — pick a disk and write a Pantry Host image onto it.
#
#   ./flash.sh                       # newest dist/*.img(.xz), then choose a disk
#   ./flash.sh path/to/image.img.xz  # flash a specific image
#   ./flash.sh --all                 # also list internal/fixed disks (DANGER)
#   ./flash.sh --no-verify           # skip the .sha256 check before writing
#   ./flash.sh --no-expand           # don't grow the rootfs partition to fill the card
#   ./flash.sh --yes                 # don't ask for typed confirmation (DANGER)
#
# Companion to build.sh. It lists each candidate disk with its size and free
# space so you can tell the SD card apart from everything else, unmounts the
# one you pick, and dd's the image onto it (raw device on macOS for speed).
#
# Handles both .img and .img.xz inputs; .xz is decompressed on the fly.
#
# Flash by hand instead (if you'd rather not use this script) — be CERTAIN of
# the device, dd will overwrite whatever you point it at:
#   macOS:  diskutil list                        # find the card, e.g. disk6
#           diskutil unmountDisk /dev/disk6
#           xzcat IMAGE.img.xz | sudo dd of=/dev/rdisk6 bs=4M conv=fsync   # rdisk = raw, ~20x faster
#           sync && diskutil eject /dev/disk6
#   Linux:  lsblk                                 # find the card, e.g. /dev/sdX
#           sudo umount /dev/sdX*                 # if anything auto-mounted
#           xzcat IMAGE.img.xz | sudo dd of=/dev/sdX bs=4M status=progress conv=fsync && sync
# (Flashing by hand skips the rootfs-partition grow this script does; the
# device's resize2fs_once still fills the card on first boot.)

set -euo pipefail

# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"

log()  { echo "==> $*"; }
warn() { echo "warning: $*" >&2; }
die()  { echo "error: $*" >&2; exit 1; }

OS="$(uname -s)"

# Flags ---------------------------------------------------------------------

SHOW_ALL=0
VERIFY=1
ASSUME_YES=0
EXPAND=1
IMAGE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)        SHOW_ALL=1 ;;
    --no-verify)  VERIFY=0 ;;
    --no-expand)  EXPAND=0 ;;
    --yes|-y)     ASSUME_YES=1 ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's|^# \{0,1\}||'
      exit 0
      ;;
    -*) die "unknown flag: $1 (use --help)" ;;
    *)  [ -z "$IMAGE" ] || die "more than one image given: $1"; IMAGE="$1" ;;
  esac
  shift
done

# Helpers -------------------------------------------------------------------

# Bytes → base-10 human string (matches the capacity printed on the card).
human() {
  awk -v b="${1:-0}" 'BEGIN{
    if (b+0 <= 0) { print "—"; exit }
    split("B KB MB GB TB PB", u, " ");
    i = 1; while (b >= 1000 && i < 6) { b /= 1000; i++ }
    printf (i == 1 ? "%d %s\n" : "%.1f %s\n"), b, u[i]
  }'
}

# Grow the rootfs partition to fill the card --------------------------------
# The image is built tiny (~2 GB rootfs) so it downloads small and fits the
# smallest supported card — the build can't know the target card's size. Stock
# Pi OS handles the gap in two halves: grow the *partition* to fill the disk,
# then a self-deleting `resize2fs_once` grows the *filesystem* to fill the
# partition on first boot. Our image keeps the second half (resize2fs_once
# ships baked in and runs on first boot) but, having stripped the firstboot
# init for boot speed, lost the first half — so a flashed card was stuck at
# 2 GB on any card. We restore the partition grow HERE, at flash time, where —
# unlike at build time — the card's real size is known. macOS has no ext4
# tooling, but growing an MBR partition is pure partition-table metadata (a
# 4-byte sector-count field), so a dependency-free byte patch works on both
# platforms; the on-device resize2fs_once then fills the new space on first
# boot. On Linux we also grow the filesystem right here when resize2fs exists,
# so there's nothing left for the Pi to do.
#
# Best-effort: any uncertainty warns and skips rather than risking the
# partition table — the card still boots (at 2 GB), recoverable later with a
# manual `sudo resize2fs /dev/mmcblk0p2`. A successful dd is never undone here.
expand_rootfs() {
  local whole="$1" os="$2"
  local total mbr part

  command -v perl >/dev/null 2>&1 || { warn "perl not found — skipping rootfs expand"; return 0; }

  # Whole-disk size in 512-byte LBA units (MBR entries are always 512-based,
  # regardless of the device's physical block size).
  if [ "$os" = "Darwin" ]; then
    diskutil unmountDisk "$whole" >/dev/null 2>&1 || true   # FAT boot vol auto-mounts post-dd
    local info bytes; info="$(mktemp)"
    diskutil info -plist "$whole" > "$info" 2>/dev/null || { rm -f "$info"; warn "diskutil info failed — skipping expand"; return 0; }
    bytes="$(plutil -extract TotalSize raw -o - "$info" 2>/dev/null)"; rm -f "$info"
    [[ "$bytes" =~ ^[0-9]+$ ]] || { warn "could not read card size — skipping expand"; return 0; }
    total=$(( bytes / 512 ))
  else
    for p in "${whole}"*; do [ -b "$p" ] && [ "$p" != "$whole" ] && sudo umount "$p" 2>/dev/null || true; done
    total="$(sudo blockdev --getsz "$whole" 2>/dev/null)" || { warn "blockdev failed — skipping expand"; return 0; }
    [[ "$total" =~ ^[0-9]+$ ]] || { warn "could not read card size — skipping expand"; return 0; }
  fi

  # Read the MBR, patch partition #2's size field in a temp file, write it back.
  mbr="$(mktemp)"
  sudo dd if="$whole" of="$mbr" bs=512 count=1 2>/dev/null || { warn "could not read MBR — skipping expand"; rm -f "$mbr"; return 0; }
  if ! perl -e '
        my ($f,$total) = ($ARGV[0], $ARGV[1]+0);
        open(my $fh,"+<:raw",$f) or die "open: $!\n";
        my $m; read($fh,$m,512)==512 or die "short read\n";
        die "not an MBR (bad 0x55AA signature)\n" unless substr($m,510,2) eq "\x55\xaa";
        my $b = 462;                                        # partition entry #2
        my $type = unpack("C", substr($m,$b+4,1));
        die sprintf("partition 2 type 0x%02x is not Linux (0x83)\n",$type) unless $type==0x83;
        my $start = unpack("V", substr($m,$b+8,4));
        my $cur   = unpack("V", substr($m,$b+12,4));
        my $new   = $total - $start;
        die "already fills the card\n" unless $new > $cur;
        substr($m,$b+12,4) = pack("V",$new);
        seek($fh,0,0); print {$fh} $m; close($fh);
        printf STDERR "rootfs partition: %d -> %d sectors (%.1f GB)\n",$cur,$new,$new*512/1e9;
      ' "$mbr" "$total"; then
    log "rootfs already fills the card (or unexpected layout) — nothing to grow"
    rm -f "$mbr"; return 0
  fi
  sudo dd if="$mbr" of="$whole" bs=512 count=1 conv=notrunc 2>/dev/null || { warn "MBR write-back failed — skipping expand"; rm -f "$mbr"; return 0; }
  rm -f "$mbr"; sync
  log "grew rootfs partition to fill the card"

  if [ "$os" = "Linux" ]; then
    # Re-read the table so the kernel sees the bigger partition, then grow the
    # ext4 filesystem into it. (macOS: the Pi does this on first boot.)
    sudo partprobe "$whole" 2>/dev/null || sudo blockdev --rereadpt "$whole" 2>/dev/null || true
    case "$whole" in *[0-9]) part="${whole}p2" ;; *) part="${whole}2" ;; esac
    if command -v resize2fs >/dev/null 2>&1 && [ -b "$part" ]; then
      sudo e2fsck -fy "$part" >/dev/null 2>&1 || true
      sudo resize2fs "$part" >/dev/null 2>&1 && log "grew filesystem to fill the card" \
        || warn "resize2fs failed — the Pi will finish on first boot"
    else
      log "resize2fs unavailable — the Pi grows the filesystem on first boot"
    fi
  else
    log "the Pi grows the filesystem to match on first boot (resize2fs_once)"
  fi
}

# Resolve the image ---------------------------------------------------------

if [ -z "$IMAGE" ]; then
  # Newest .img / .img.xz in dist/, by mtime. ls -t handles "no matches"
  # gracefully because nullglob isn't on; we filter the literal globs out.
  newest=""; newest_t=0
  for f in "$DIST_DIR"/*.img "$DIST_DIR"/*.img.xz; do
    [ -f "$f" ] || continue
    t=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)
    if [ "$t" -ge "$newest_t" ]; then newest_t=$t; newest="$f"; fi
  done
  [ -n "$newest" ] || die "no image given and none found in $DIST_DIR (run ./build.sh first)"
  IMAGE="$newest"
  log "using newest image in dist/: $(basename "$IMAGE")"
fi

[ -f "$IMAGE" ] || die "image not found: $IMAGE"
[ -s "$IMAGE" ] || die "image is empty: $IMAGE"
IMAGE="$(cd "$(dirname "$IMAGE")" && pwd)/$(basename "$IMAGE")"
log "image: $IMAGE ($(du -h "$IMAGE" | cut -f1))"

# Optional checksum check (build.sh writes <image>.sha256 alongside).
if (( VERIFY )) && [ -f "$IMAGE.sha256" ] && command -v shasum >/dev/null 2>&1; then
  log "verifying $(basename "$IMAGE").sha256"
  ( cd "$(dirname "$IMAGE")" && shasum -a 256 -c "$(basename "$IMAGE").sha256" ) \
    || die "checksum mismatch — image is corrupt or truncated, not flashing"
elif (( VERIFY )) && [ ! -f "$IMAGE.sha256" ]; then
  warn "no $(basename "$IMAGE").sha256 next to the image — skipping verification"
fi

# Enumerate disks -----------------------------------------------------------
# Builds two parallel arrays: DISK_IDS (e.g. "disk4" / "sdb") and DISK_LINES
# (a one-line summary). bash 3.2 has no associative arrays, hence the pair.

DISK_IDS=()
DISK_LINES=()

enumerate_macos() {
  local plist df_cache d count i media size internal removable bus free mounts loc
  plist="$(mktemp)"; df_cache="$(mktemp)"
  # Always list every physical disk; we filter below. `external physical`
  # misses built-in SD card readers (they sit on the internal bus but their
  # media is removable), which is the most common card to flash on a Mac.
  diskutil list -plist physical > "$plist"
  df -k > "$df_cache"

  count="$(plutil -extract WholeDisks raw -o - "$plist" 2>/dev/null || echo 0)"
  [[ "$count" =~ ^[0-9]+$ ]] || count=0

  for (( i = 0; i < count; i++ )); do
    d="$(plutil -extract "WholeDisks.$i" raw -o - "$plist" 2>/dev/null)" || continue
    [ -n "$d" ] || continue
    local info; info="$(mktemp)"
    diskutil info -plist "/dev/$d" > "$info" 2>/dev/null || { rm -f "$info"; continue; }
    media="$(plutil -extract MediaName raw -o - "$info" 2>/dev/null || echo '?')"
    size="$(plutil -extract TotalSize raw -o - "$info" 2>/dev/null || echo 0)"
    internal="$(plutil -extract Internal raw -o - "$info" 2>/dev/null || echo false)"
    removable="$(plutil -extract RemovableMediaOrExternalDevice raw -o - "$info" 2>/dev/null || echo false)"
    bus="$(plutil -extract BusProtocol raw -o - "$info" 2>/dev/null || echo '?')"
    rm -f "$info"

    # Default to removable/external media only (covers USB drives and built-in
    # card readers); --all also lists the internal boot disk.
    if (( ! SHOW_ALL )) && [ "$removable" != "true" ]; then continue; fi

    free="$(awk -v dd="$d" '$1 ~ "^/dev/" dd "(s[0-9]|$)" { s += $4 } END { print s*1024 }' "$df_cache")"
    mounts="$(awk -v dd="$d" '$1 ~ "^/dev/" dd "(s[0-9]|$)" {
                p=""; for (j=9; j<=NF; j++) p = p (j>9?" ":"") $j; print p }' "$df_cache" | paste -sd, - )"

    if [ "$removable" = "true" ]; then loc="removable"
    elif [ "$internal" = "true" ]; then loc="internal"
    else loc="external"; fi

    DISK_IDS+=("$d")
    DISK_LINES+=("$(printf '%-7s %9s   %-22s [%s/%s]   free %s%s' \
      "$d" "$(human "$size")" "$media" "$bus" "$loc" "$(human "$free")" \
      "$( [ -n "$mounts" ] && echo " on $mounts" )")")
  done
  rm -f "$plist" "$df_cache"
}

enumerate_linux() {
  local name size model tran rm type ro free mounts loc
  # -d: whole disks only, -b: bytes, -n: no header, -p stays short via NAME.
  while IFS=$'\t' read -r name size model tran rm type ro; do
    [ "$type" = "disk" ] || continue
    if (( ! SHOW_ALL )); then
      # Default to removable / USB / SD-MMC media only.
      [ "$rm" = "1" ] || [ "$tran" = "usb" ] || [ "$tran" = "mmc" ] || continue
    fi
    free="$(lsblk -bno FSAVAIL "/dev/$name" 2>/dev/null | awk '{ s += $1 } END { print s+0 }')"
    mounts="$(lsblk -no MOUNTPOINT "/dev/$name" 2>/dev/null | sed '/^$/d' | paste -sd, - )"
    [ "$rm" = "1" ] && loc="removable" || loc="fixed"
    [ -n "$tran" ] && loc="$loc/$tran"

    DISK_IDS+=("$name")
    DISK_LINES+=("$(printf '%-7s %9s   %-22s [%s]   free %s%s' \
      "$name" "$(human "$size")" "${model:-?}" "$loc" "$(human "$free")" \
      "$( [ -n "$mounts" ] && echo " on $mounts" )")")
  done < <(lsblk -dbnr -o NAME,SIZE,MODEL,TRAN,RM,TYPE,RO 2>/dev/null | tr ' ' '\t')
}

case "$OS" in
  Darwin) command -v diskutil >/dev/null || die "diskutil not found"; enumerate_macos ;;
  Linux)  command -v lsblk    >/dev/null || die "lsblk not found";    enumerate_linux ;;
  *)      die "unsupported OS: $OS (only macOS and Linux are handled)" ;;
esac

if [ "${#DISK_IDS[@]}" -eq 0 ]; then
  if (( SHOW_ALL )); then
    die "no disks found"
  else
    die "no external/removable disks found — insert the card, or pass --all to list every disk"
  fi
fi

# Pick a disk ---------------------------------------------------------------

echo
echo "Available disks:"
for i in "${!DISK_IDS[@]}"; do
  printf "  %2d) %s\n" "$((i + 1))" "${DISK_LINES[$i]}"
done
echo

read -r -p "Select a disk to flash [1-${#DISK_IDS[@]}] (anything else cancels): " choice
[[ "$choice" =~ ^[0-9]+$ ]] || die "cancelled"
[ "$choice" -ge 1 ] && [ "$choice" -le "${#DISK_IDS[@]}" ] || die "out of range — cancelled"

SEL="${DISK_IDS[$((choice - 1))]}"
SEL_LINE="${DISK_LINES[$((choice - 1))]}"

# Resolve the target device node.
if [ "$OS" = "Darwin" ]; then
  TARGET="/dev/r$SEL"      # raw device: ~10–20× faster for dd on macOS
  WHOLE="/dev/$SEL"
else
  TARGET="/dev/$SEL"
  WHOLE="/dev/$SEL"
fi

# Confirm -------------------------------------------------------------------

echo
echo "  $SEL_LINE"
echo
echo "!! This ERASES $WHOLE entirely. Everything on it will be lost. !!"
echo
if (( ! ASSUME_YES )); then
  read -r -p "Type '$SEL' to confirm: " confirm
  [ "$confirm" = "$SEL" ] || die "confirmation did not match '$SEL' — aborting"
fi

# Probe dd capabilities (BSD dd on older macOS lacks status=/conv=). bs is
# always present so the args array is never empty — expanding an empty array
# under `set -u` is fatal in bash 3.2 (macOS's /bin/bash).
[ "$OS" = "Darwin" ] && DD_ARGS=("bs=4m") || DD_ARGS=("bs=4M")
if printf '' | dd of=/dev/null conv=fsync >/dev/null 2>&1; then
  DD_ARGS+=("conv=fsync")
fi
PROGRESS=0
if printf '' | dd of=/dev/null status=progress >/dev/null 2>&1; then
  DD_ARGS+=("status=progress"); PROGRESS=1
fi

# Unmount -------------------------------------------------------------------

log "unmounting $WHOLE"
if [ "$OS" = "Darwin" ]; then
  diskutil unmountDisk "$WHOLE" || die "could not unmount $WHOLE"
else
  for part in "${WHOLE}"*; do
    [ -b "$part" ] && [ "$part" != "$WHOLE" ] && sudo umount "$part" 2>/dev/null || true
  done
fi

# Write ---------------------------------------------------------------------

log "writing to $TARGET (sudo — you may be prompted for your password)"
(( PROGRESS )) || warn "this dd has no progress output; on macOS press Ctrl-T to peek"

if [[ "$IMAGE" == *.xz ]]; then
  command -v xz >/dev/null || die "xz not found (needed to decompress $IMAGE)"
  xz -dc "$IMAGE" | sudo dd of="$TARGET" "${DD_ARGS[@]}"
else
  sudo dd if="$IMAGE" of="$TARGET" "${DD_ARGS[@]}"
fi

log "flushing buffers"
sync

# Grow the rootfs partition to fill the card (best-effort) -------------------
if (( EXPAND )); then
  log "expanding rootfs partition to fill $WHOLE"
  expand_rootfs "$WHOLE" "$OS"
else
  log "--no-expand: leaving rootfs at the image's ~2 GB (Pi won't reclaim the rest)"
fi

# Eject ---------------------------------------------------------------------

if [ "$OS" = "Darwin" ]; then
  diskutil eject "$WHOLE" >/dev/null 2>&1 && log "ejected $WHOLE — safe to remove" \
    || warn "could not eject $WHOLE; unmount it manually before removing"
else
  sudo eject "$WHOLE" >/dev/null 2>&1 && log "ejected $WHOLE — safe to remove" \
    || log "done — safe to remove $WHOLE"
fi

echo
log "done. Plug the card into the Pi and power on."
