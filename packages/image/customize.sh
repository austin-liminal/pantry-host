#!/bin/bash
# customize.sh — runs inside the builder container; assumes root + privileged.
#
# Mounts the Pi OS image read-write via a loop device, drops in pantry-server
# + Tailscale, bakes in all system config (hostname, WiFi, timezone, keyboard,
# user account) offline, then unmounts. There's no first-boot script: the card
# boots once, fully configured. The host's build.sh bind-mounts everything
# under /work.
#
# Required env (set by build.sh):
#   IMAGE_PATH         — path to the writable .img inside the container
#   BINARY_PATH        — path to the cross-compiled pantry-server-armv6
#   TAILSCALE_DEB_PATH — path to a downloaded tailscale_*_armhf.deb
#   SERVER_DIR         — path to packages/server/ (for the systemd unit)
#   WIFI_SSID, WIFI_PSK, WIFI_COUNTRY, HOSTNAME, USERNAME, USER_PASSWORD,
#   SSH_AUTHORIZED_KEYS, TIMEZONE, KEYBOARD_LAYOUT
# Optional env:
#   KERNEL_DIR         — staged custom-kernel dir (kernel-pantry.img + kmod/ +
#                        kernelrelease). When unset (build.sh --no-kernel), the
#                        image ships the stock Pi OS kernel unchanged.
#
# Cleanup is signal-safe: a trap unmounts and detaches the loop device on
# any exit so a partially-failed run leaves the host in a clean state.

set -euo pipefail

log()  { echo "[customize] $*"; }
warn() { echo "[customize] warning: $*" >&2; }
die()  { echo "[customize] error: $*" >&2; exit 1; }

[ -n "${IMAGE_PATH:-}" ]         || die "IMAGE_PATH not set"
[ -f "$IMAGE_PATH" ]             || die "IMAGE_PATH does not exist: $IMAGE_PATH"
[ -n "${BINARY_PATH:-}" ]        || die "BINARY_PATH not set"
[ -f "$BINARY_PATH" ]            || die "binary missing: $BINARY_PATH"
[ -n "${TAILSCALE_DEB_PATH:-}" ] || die "TAILSCALE_DEB_PATH not set"
[ -f "$TAILSCALE_DEB_PATH" ]     || die "tailscale .deb missing: $TAILSCALE_DEB_PATH"
[ -n "${SERVER_DIR:-}" ]         || die "SERVER_DIR not set"
[ -d "$SERVER_DIR" ]             || die "server dir missing: $SERVER_DIR"

: "${HOSTNAME:=pantry}"
: "${USERNAME:=pi}"
: "${WIFI_COUNTRY:=US}"
: "${TIMEZONE:=Etc/UTC}"
: "${KEYBOARD_LAYOUT:=us}"
: "${USER_PASSWORD:=}"
: "${SSH_AUTHORIZED_KEYS:=}"
: "${WIFI_SSID:=}"
: "${WIFI_PSK:=}"

if [ -z "$USER_PASSWORD" ] && [ -z "$SSH_AUTHORIZED_KEYS" ]; then
  die "set USER_PASSWORD or SSH_AUTHORIZED_KEYS in .env.image — otherwise the Pi has no way in"
fi

# Hash the password on the host so the boot partition never sees plaintext.
# crypt() $6$ → SHA-512.
USER_PASSWORD_HASH=""
if [ -n "$USER_PASSWORD" ]; then
  USER_PASSWORD_HASH="$(openssl passwd -6 "$USER_PASSWORD")"
fi

MOUNT_ROOT="$(mktemp -d /tmp/pantry-mount.XXXXXX)"

cleanup() {
  set +e
  log "cleaning up mounts"
  # Order matters: inner mount first, then the parent rootfs.
  for m in proc sys dev/pts dev boot/firmware ""; do
    if mountpoint -q "$MOUNT_ROOT/$m" 2>/dev/null; then
      umount "$MOUNT_ROOT/$m" 2>/dev/null || umount -l "$MOUNT_ROOT/$m" 2>/dev/null
    fi
  done
  rmdir "$MOUNT_ROOT" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Read partition layout + mount at byte offsets -----------------------------
# We deliberately avoid `losetup -P`: it relies on udev to create per-
# partition nodes (loop0p1, loop0p2), and udev isn't running inside this
# container. `mount -o loop,offset=…,sizelimit=…` lets the kernel allocate
# a fresh loop device per filesystem without needing partition device nodes
# to appear in /dev.
log "reading partition layout"
PART_INFO="$(parted -m -s "$IMAGE_PATH" unit B print)"
printf '%s\n' "$PART_INFO" | sed 's/^/  /'
BOOT_START="$(printf '%s\n' "$PART_INFO" | awk -F: '/^1:/{gsub(/B/,"",$2); print $2; exit}')"
BOOT_SIZE="$( printf '%s\n' "$PART_INFO" | awk -F: '/^1:/{gsub(/B/,"",$4); print $4; exit}')"
ROOT_START="$(printf '%s\n' "$PART_INFO" | awk -F: '/^2:/{gsub(/B/,"",$2); print $2; exit}')"
ROOT_SIZE="$( printf '%s\n' "$PART_INFO" | awk -F: '/^2:/{gsub(/B/,"",$4); print $4; exit}')"
[ -n "$BOOT_START" ] && [ -n "$BOOT_SIZE" ] && \
[ -n "$ROOT_START" ] && [ -n "$ROOT_SIZE" ] || die "could not parse partition table"
log "boot: start=$BOOT_START size=$BOOT_SIZE"
log "root: start=$ROOT_START size=$ROOT_SIZE"

log "mounting rootfs"
mount -o "loop,offset=$ROOT_START,sizelimit=$ROOT_SIZE" "$IMAGE_PATH" "$MOUNT_ROOT"
mkdir -p "$MOUNT_ROOT/boot/firmware"
log "mounting boot at /boot/firmware"
mount -o "loop,offset=$BOOT_START,sizelimit=$BOOT_SIZE" "$IMAGE_PATH" "$MOUNT_ROOT/boot/firmware"

# Custom kernel (optional) --------------------------------------------------
# build.sh's kernel stage stages a stripped ARMv6 kernel under $KERNEL_DIR
# (kernel-pantry.img + a kmod/lib/modules/<rel> tree + a kernelrelease file).
# Copy it in as a SEPARATELY-named kernel-pantry.img with its own module dir;
# the stock kernel.img and its modules stay untouched as a rollback fallback
# (config.txt selects which one boots, set further below). depmod + apt-mark
# hold run later in the chroot block. Skipped entirely when KERNEL_DIR is unset
# (build.sh --no-kernel) — the image then ships the stock kernel.
KERNEL_RELEASE=""
if [ -n "${KERNEL_DIR:-}" ] && [ -f "$KERNEL_DIR/kernel-pantry.img" ]; then
  KERNEL_RELEASE="$(tr -d '[:space:]' < "$KERNEL_DIR/kernelrelease" 2>/dev/null || true)"
  # Fall back to the single dir name modules_install produced.
  if [ -z "$KERNEL_RELEASE" ] && [ -d "$KERNEL_DIR/kmod/lib/modules" ]; then
    KERNEL_RELEASE="$(ls "$KERNEL_DIR/kmod/lib/modules" | head -n1)"
  fi
  [ -n "$KERNEL_RELEASE" ] || die "KERNEL_DIR set but no kernelrelease / module tree found"
  [ -d "$KERNEL_DIR/kmod/lib/modules/$KERNEL_RELEASE" ] || \
    die "module tree missing: $KERNEL_DIR/kmod/lib/modules/$KERNEL_RELEASE"
  log "installing custom kernel ($KERNEL_RELEASE) as kernel-pantry.img"
  install -m 0644 "$KERNEL_DIR/kernel-pantry.img" "$MOUNT_ROOT/boot/firmware/kernel-pantry.img"
  log "installing kernel modules to /lib/modules/$KERNEL_RELEASE"
  mkdir -p "$MOUNT_ROOT/lib/modules"
  cp -a "$KERNEL_DIR/kmod/lib/modules/$KERNEL_RELEASE" "$MOUNT_ROOT/lib/modules/"
  # DTBs/overlays are deliberately NOT injected: the stock /boot/firmware DTBs +
  # overlays are built from the same rpi-6.12.y tree and describe hardware, not
  # kernel config, so they serve both kernels and keep the stock-kernel
  # fallback's device tree intact. (Inject $KERNEL_DIR/dtbs only if a live test
  # shows the custom kernel needs its own.)
fi

# Drop the pantry-server binary into place ----------------------------------
# The systemd unit (packages/server/scripts/pantry-server.service) expects
# the binary at /home/pi/server/pantry-server with WorkingDirectory there
# too — pantry.db gets created beside it.
log "installing pantry-server binary"
mkdir -p "$MOUNT_ROOT/home/$USERNAME/server"
install -m 0755 "$BINARY_PATH" "$MOUNT_ROOT/home/$USERNAME/server/pantry-server"
# Also drop a symlink in /usr/local/bin/ so the binary is on PATH for SSH
# debugging sessions.
ln -sf "/home/$USERNAME/server/pantry-server" "$MOUNT_ROOT/usr/local/bin/pantry-server"

# Systemd unit ---------------------------------------------------------------
# Reuse the existing unit from packages/server/scripts/, dropping a tiny
# override so TAILSCALE_OPERATOR matches whichever USERNAME the user picked
# in .env.image (defaults to `pi`, matching the unit's User= field).
log "installing pantry-server.service"
install -m 0644 "$SERVER_DIR/scripts/pantry-server.service" \
  "$MOUNT_ROOT/etc/systemd/system/pantry-server.service"
mkdir -p "$MOUNT_ROOT/etc/systemd/system/pantry-server.service.d"
cat > "$MOUNT_ROOT/etc/systemd/system/pantry-server.service.d/pi-image.conf" <<DROPIN
[Service]
Environment=TAILSCALE_OPERATOR=$USERNAME
# Bind the server to the standard HTTP port so users hit http://pantry.local
# (no :4001 suffix) once the Pi is on the LAN. Granting
# CAP_NET_BIND_SERVICE lets pantry-server (which runs as User=pi) bind to
# privileged ports without running as root.
Environment=GRAPHQL_PORT=80
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
DROPIN
# Enable at next boot. We can't run `systemctl enable` against the offline
# rootfs without a working dbus; create the wants-symlink by hand instead.
mkdir -p "$MOUNT_ROOT/etc/systemd/system/multi-user.target.wants"
ln -sf /etc/systemd/system/pantry-server.service \
  "$MOUNT_ROOT/etc/systemd/system/multi-user.target.wants/pantry-server.service"

# Tailscale ------------------------------------------------------------------
# dpkg-deb -x just extracts data.tar.* into the rootfs. We then run the
# postinst manually through qemu+chroot to register systemd units, create
# the tailscale user, etc.
log "installing tailscale via chroot+qemu"
# qemu-user-static is already registered via binfmt at the host level
# (the host runs `tonistiigi/binfmt --install all` before invoking us).
cp /usr/bin/qemu-arm-static "$MOUNT_ROOT/usr/bin/qemu-arm-static"

mount -t proc proc "$MOUNT_ROOT/proc"
mount -t sysfs sys "$MOUNT_ROOT/sys"
mount --bind /dev "$MOUNT_ROOT/dev"
mount --bind /dev/pts "$MOUNT_ROOT/dev/pts"

cp "$TAILSCALE_DEB_PATH" "$MOUNT_ROOT/tmp/tailscale.deb"
# DEBIAN_FRONTEND=noninteractive keeps postinst from prompting. The dpkg
# install runs against the in-rootfs binary set via qemu emulation.
chroot "$MOUNT_ROOT" /bin/bash -c "DEBIAN_FRONTEND=noninteractive dpkg -i /tmp/tailscale.deb || (apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -fy && dpkg -i /tmp/tailscale.deb)"
rm -f "$MOUNT_ROOT/tmp/tailscale.deb"
# Tailscale is installed but deliberately NOT started at boot. tailscaled's
# bring-up (~8s on a Zero W, even unconfigured — it stands up the tun device,
# wgengine, netstack) is pure waste until the user actually links the device,
# and it sits on the multi-user.target critical chain: it delays boot
# completion and steals the single ARMv6 core in the exact window the user
# first loads the SPA. So we defer it. The in-app installer's Tailscale step
# starts it on demand — pantry-server runs `sudo systemctl start tailscaled`
# before `tailscale up`, then `sudo systemctl enable tailscaled` once auth
# succeeds, so a configured node restores its tunnel on every later boot but a
# fresh image never pays the cost. pi's NOPASSWD sudo (configured below)
# authorizes both, and tailscaled's control socket is world-rw (0666) so the
# unprivileged `tailscale up --operator=pi` talks to it without sudo.
# Strip whatever enablement the deb's postinst created.
chroot "$MOUNT_ROOT" /bin/bash -c "systemctl disable tailscaled.service" 2>/dev/null || true
rm -f "$MOUNT_ROOT/etc/systemd/system/multi-user.target.wants/tailscaled.service"

# User account (prebaked) ----------------------------------------------------
# Bookworm Lite ships a UID-1000 `pi` user but parks it in a "needs first-boot
# setup" state that triggers the interactive username/password dialog
# (userconfig.service — disabled further below). We finish the account here,
# offline, so the image boots fully configured with no console prompt: set the
# password hash, group memberships, passwordless sudo (the installer-ui's
# `tailscale up` needs it), and any SSH keys. Runs in the chroot so the writes
# land in the image's own user/group databases. `set -euo pipefail` aborts the
# build if any of this fails, so a broken account never ships.
log "configuring user '$USERNAME' offline (prebaked)"
chroot "$MOUNT_ROOT" /usr/bin/env \
  PH_USER="$USERNAME" PH_HASH="$USER_PASSWORD_HASH" PH_KEYS="$SSH_AUTHORIZED_KEYS" \
  /bin/bash -euc '
    if ! id "$PH_USER" >/dev/null 2>&1; then
      useradd -m -s /bin/bash "$PH_USER"
    fi
    for g in adm dialout cdrom sudo audio video plugdev games users input render netdev gpio i2c spi; do
      usermod -aG "$g" "$PH_USER" 2>/dev/null || true
    done
    if [ -n "$PH_HASH" ]; then
      printf "%s:%s\n" "$PH_USER" "$PH_HASH" | chpasswd -e
    fi
    printf "%s ALL=(ALL) NOPASSWD: ALL\n" "$PH_USER" > "/etc/sudoers.d/010_${PH_USER}-nopasswd"
    chmod 0440 "/etc/sudoers.d/010_${PH_USER}-nopasswd"
    if [ -n "$PH_KEYS" ]; then
      install -d -m 700 -o "$PH_USER" -g "$PH_USER" "/home/$PH_USER/.ssh"
      printf "%s\n" "$PH_KEYS" > "/home/$PH_USER/.ssh/authorized_keys"
      chown "$PH_USER":"$PH_USER" "/home/$PH_USER/.ssh/authorized_keys"
      chmod 600 "/home/$PH_USER/.ssh/authorized_keys"
    fi
  '

# Custom kernel: refresh depmod + pin the kernel/firmware packages -----------
# Runs in the chroot window (proc/sys/dev still mounted). modules_install
# already depmod'd at build time, so this is belt-and-suspenders to match the
# on-image tree. apt-mark hold stops a later `apt upgrade` from replacing the
# stock kernel.img fallback or regenerating an initramfs under us. Package names
# vary across Pi OS releases, so detect rather than hardcode.
if [ -n "$KERNEL_RELEASE" ]; then
  log "depmod $KERNEL_RELEASE + holding kernel/firmware packages"
  chroot "$MOUNT_ROOT" /bin/bash -c "depmod $KERNEL_RELEASE" 2>/dev/null || \
    warn "depmod returned non-zero (modules were depmod'd at build time; continuing)"
  HOLD_PKGS="$(chroot "$MOUNT_ROOT" /bin/bash -c "dpkg-query -W -f='\${Package}\n' 2>/dev/null | grep -E '^(raspberrypi-kernel|linux-image-rpi|raspberrypi-bootloader|raspi-firmware)' || true")"
  if [ -n "$HOLD_PKGS" ]; then
    # shellcheck disable=SC2086
    chroot "$MOUNT_ROOT" /bin/bash -c "apt-mark hold $(echo $HOLD_PKGS | tr '\n' ' ')" 2>/dev/null || \
      warn "apt-mark hold failed for: $HOLD_PKGS"
  else
    warn "no kernel/firmware package matched for apt-mark hold"
  fi
fi

# Trim apt state the tailscale install touched. The dpkg -i fallback path
# runs `apt-get update`, repopulating /var/lib/apt/lists with tens of MB of
# package indexes that have no business shipping in the image; the install
# may also cache .debs. Clearing both shrinks the compressed output.
log "cleaning apt caches"
chroot "$MOUNT_ROOT" /bin/bash -c "apt-get clean" 2>/dev/null || true
rm -rf "$MOUNT_ROOT/var/lib/apt/lists/"* 2>/dev/null || true

# Done with chroot mounts.
umount "$MOUNT_ROOT/dev/pts"
umount "$MOUNT_ROOT/dev"
umount "$MOUNT_ROOT/sys"
umount "$MOUNT_ROOT/proc"
rm -f "$MOUNT_ROOT/usr/bin/qemu-arm-static"

# First-boot user wizard -----------------------------------------------------
# Disable userconfig.service. On a stock Bookworm image this oneshot runs the
# "enter a new username / set a password" dialog on the console at first boot —
# even though a `pi` user already exists. The account is prebaked above, so we
# drop its enablement symlink and mask the unit.
#
# (This section used to also install pantry-console.service — a `journalctl
# --follow` of the server log piped onto tty1 — and mask getty@tty1/autovt@tty1.
# That was dropped in the boot-time pass: a continuous follow steals the single
# ARMv6 core, and the box is headless. tty1 now keeps the stock getty login —
# a usable debug console if a monitor is ever plugged in, at no boot cost.)
#
# This touches only the mounted rootfs and runs before the shrink below.
log "disabling first-boot user wizard (userconfig.service)"
rm -f "$MOUNT_ROOT/etc/systemd/system/multi-user.target.wants/userconfig.service"
ln -sf /dev/null "$MOUNT_ROOT/etc/systemd/system/userconfig.service"

# Offline system config (hostname / timezone / keyboard / WiFi) -------------
# Everything here used to run on the device via firstrun.sh, gated behind a
# throwaway boot into kernel-command-line.target that existed only to run the
# script and then `reboot` into multi-user — two full boot cycles. But it's
# all static config known at build time, so we bake it straight into the
# rootfs now. The card boots ONCE, directly into multi-user, already
# configured: no first-boot pass, no reboot. (Services — ssh, pantry-server,
# tailscaled — are enabled offline via their wants-symlinks elsewhere here.)

# Hostname + the 127.0.1.1 line in /etc/hosts.
log "setting hostname to '$HOSTNAME'"
echo "$HOSTNAME" > "$MOUNT_ROOT/etc/hostname"
if grep -q '^127\.0\.1\.1' "$MOUNT_ROOT/etc/hosts" 2>/dev/null; then
  sed -i "s/^127\.0\.1\.1.*/127.0.1.1\t$HOSTNAME/" "$MOUNT_ROOT/etc/hosts"
else
  printf '127.0.1.1\t%s\n' "$HOSTNAME" >> "$MOUNT_ROOT/etc/hosts"
fi

# Timezone: the /etc/localtime symlink + /etc/timezone name. Read at boot; the
# zoneinfo db already lives in the rootfs, so no dpkg-reconfigure needed.
if [ -n "$TIMEZONE" ] && [ -e "$MOUNT_ROOT/usr/share/zoneinfo/$TIMEZONE" ]; then
  log "setting timezone to $TIMEZONE"
  ln -sf "/usr/share/zoneinfo/$TIMEZONE" "$MOUNT_ROOT/etc/localtime"
  echo "$TIMEZONE" > "$MOUNT_ROOT/etc/timezone"
fi

# Keyboard layout. keyboard-setup.service reads /etc/default/keyboard at boot.
if [ -n "$KEYBOARD_LAYOUT" ] && [ -f "$MOUNT_ROOT/etc/default/keyboard" ]; then
  log "setting keyboard layout to $KEYBOARD_LAYOUT"
  sed -i "s/^XKBLAYOUT=.*/XKBLAYOUT=\"$KEYBOARD_LAYOUT\"/" \
    "$MOUNT_ROOT/etc/default/keyboard"
fi

# WiFi — DEVELOPER / POWER-USER path (credentials baked in at build time).
#
# Two mutually-exclusive WiFi worlds share this image, selected by whether
# $WIFI_SSID is set at build time:
#   * SSID set  → we already know the network to join, so we DON'T need
#     NetworkManager's scan/autoconnect/portal machinery. NM is the boot-time
#     long pole on the single-core Zero W: it starts ~12s in and doesn't drive
#     wlan0 until ~18s, gating time-to-reachable at ~22s — even though the
#     built-in brcmfmac radio is up at ~0.8s. So here we mask NM and wire a
#     lightweight stack that associates the instant the interface exists:
#       - wpa_supplicant@wlan0: the interface-specific template is Requires=+
#         After= the wlan0 .device, so it associates as soon as udev adds wlan0
#         (~1-2s) instead of waiting on NM's late, heavy startup.
#       - dhclient@wlan0: leases an address and writes /etc/resolv.conf itself
#         via /sbin/dhclient-script (systemd-resolved isn't installed on Lite;
#         isc-dhcp-client is, and with no resolvconf it writes resolv.conf
#         directly). No systemd-networkd needed.
#   * SSID unset → the shipping image for friends & family: NM stays enabled so
#     the captive-portal first-boot flow (JP's workstream) can gather creds in
#     AP mode. Boot-to-reachable speed is moot there — there's no network to
#     join until the user picks one through the portal. See the
#     NetworkManager.state block below, guarded on the same flag.
if [ -n "$WIFI_SSID" ]; then
  log "baking fast WiFi path (wpa_supplicant@wlan0 + dhclient, NM masked) for SSID '$WIFI_SSID'"

  # wpa_supplicant config the @wlan0 template reads. 0600 root — holds the PSK.
  install -d -m 755 "$MOUNT_ROOT/etc/wpa_supplicant"
  WPACONF="$MOUNT_ROOT/etc/wpa_supplicant/wpa_supplicant-wlan0.conf"
  {
    echo "ctrl_interface=DIR=/run/wpa_supplicant GROUP=netdev"
    echo "country=$WIFI_COUNTRY"
    echo "update_config=1"
    echo "network={"
    echo "	ssid=\"$WIFI_SSID\""
    if [ -n "$WIFI_PSK" ]; then
      echo "	psk=\"$WIFI_PSK\""
    else
      echo "	key_mgmt=NONE"
    fi
    echo "}"
  } > "$WPACONF"
  chmod 600 "$WPACONF"

  # One foreground dhclient per interface. Type=exec so systemd tracks it
  # directly; -d keeps it in the foreground for lease renewals. It's ordered
  # After= wpa_supplicant@wlan0 and retries DISCOVER until association completes,
  # then writes the lease + resolv.conf. DefaultDependencies=no (with the
  # shutdown ordering re-added by hand) keeps it off the basic.target gate so it
  # runs in the early-boot window alongside the supplicant; After=local-fs.target
  # so /var (lease db) and /etc (resolv.conf) are writable first.
  cat > "$MOUNT_ROOT/etc/systemd/system/dhclient@.service" <<'DHUNIT'
[Unit]
Description=DHCP client on %I (Pantry fast WiFi path)
DefaultDependencies=no
Requires=sys-subsystem-net-devices-%i.device
After=local-fs.target sys-subsystem-net-devices-%i.device wpa_supplicant@%i.service
Wants=wpa_supplicant@%i.service network.target
Before=network.target shutdown.target
Conflicts=shutdown.target

[Service]
Type=exec
ExecStart=/sbin/dhclient -4 -d %I
Restart=on-failure
RestartSec=2s

[Install]
WantedBy=multi-user.target
DHUNIT

  # Enable both units offline via their wants-symlinks (no running systemd in
  # the chroot to `systemctl enable`). wpa_supplicant@.service's [Install] is
  # WantedBy=multi-user.target; replicate that for the wlan0 instance + dhclient.
  install -d "$MOUNT_ROOT/etc/systemd/system/multi-user.target.wants"
  ln -sf /lib/systemd/system/wpa_supplicant@.service \
    "$MOUNT_ROOT/etc/systemd/system/multi-user.target.wants/wpa_supplicant@wlan0.service"
  ln -sf /etc/systemd/system/dhclient@.service \
    "$MOUNT_ROOT/etc/systemd/system/multi-user.target.wants/dhclient@wlan0.service"

  # Early-start drop-in for the distro's wpa_supplicant@.service template: drop
  # the implicit After=sysinit.target/basic.target so the supplicant fires the
  # moment the wlan0 .device appears (~9.7s, storage/udev-bound on this single
  # core) instead of waiting for basic.target (~11s) + multi-user scheduling.
  # Measured on a Zero W: association ~12.9s and DHCP lease ~14.5s, vs ~17.9s
  # without it (and ~22s on the stock NetworkManager path). We re-add the
  # shutdown ordering that DefaultDependencies=no would otherwise strip.
  install -d "$MOUNT_ROOT/etc/systemd/system/wpa_supplicant@wlan0.service.d"
  cat > "$MOUNT_ROOT/etc/systemd/system/wpa_supplicant@wlan0.service.d/early.conf" <<'EOF'
[Unit]
DefaultDependencies=no
Conflicts=shutdown.target
Before=shutdown.target network-pre.target
EOF

  # Mask the daemons we're replacing: NetworkManager (the long pole) and the
  # generic dbus-activated wpa_supplicant.service — we drive the @wlan0 instance
  # directly, and two supplicants fighting over wlan0 would be a mess.
  ln -sf /dev/null "$MOUNT_ROOT/etc/systemd/system/NetworkManager.service"
  ln -sf /dev/null "$MOUNT_ROOT/etc/systemd/system/wpa_supplicant.service"
fi

# WiFi regulatory domain. firstrun.sh used to run `raspi-config nonint
# do_wifi_country` on the device; instead we set it at the cfg80211 layer via
# a kernel cmdline param, so the legal 2.4 GHz channels + tx power are in
# force before wlan0 ever comes up — no runtime step required. (Baked WiFi is
# a build-time dev convenience; the shipping flow gathers it via captive
# portal, at which point this whole block goes away.)
CMDLINE="$MOUNT_ROOT/boot/firmware/cmdline.txt"
if [ -f "$CMDLINE" ] && [ -n "$WIFI_COUNTRY" ]; then
  if ! grep -q "cfg80211.ieee80211_regdom=" "$CMDLINE"; then
    log "setting WiFi regulatory domain to $WIFI_COUNTRY via cmdline.txt"
    # cmdline.txt is one long line; append to it, preserve it.
    sed -i "1 s|\$| cfg80211.ieee80211_regdom=$WIFI_COUNTRY|" "$CMDLINE"
  fi
elif [ ! -f "$CMDLINE" ]; then
  warn "$CMDLINE not found — WiFi regulatory domain not set"
fi

# Boot-time optimization -----------------------------------------------------
# This single-core ARMv6 board can't hit single-digit seconds (WiFi assoc +
# ARMv6 kernel/systemd alone exceed that), but it ships with a self-inflicted
# extra reboot and a desktop-tuned service set. The three wins below get the
# steady-state boot toward the ~20s floor, all baked offline here.

# 1. Drop the first-boot reboot. Stock Pi OS boots ONCE through
#    init=/usr/lib/raspberrypi-sys-mods/firstboot, whose only jobs on our image
#    are an SSH-keygen and a partuuid randomize — followed by an unconditional
#    `reboot -f`, i.e. a whole extra cold-boot cycle. The keygen is already
#    covered by regenerate_ssh_host_keys.service (enabled, Before=ssh.service,
#    self-disabling — we patched it to ed25519-only above), and a per-device
#    partuuid is irrelevant for a single-board appliance. So strip the firstboot
#    init (and any Imager systemd.run leftovers) and let the card boot straight
#    into systemd. The Bookworm firstboot genuinely does no resize (keygen +
#    partuuid + custom.toml only), so stripping it loses no resize step — BUT
#    note the rootfs grow is a SEPARATE two-part mechanism that survives this:
#    the stock image ships /etc/init.d/resize2fs_once (a self-deleting SysV
#    service that grows the *filesystem* on first boot — confirmed running on
#    device), which only needs the *partition* already enlarged to fill the
#    card. Nothing here enlarges that partition (raspi-config's do_expand_rootfs
#    never runs on this image), and the build can't — it doesn't know the card
#    size. flash.sh does it instead, at flash time, where the card size IS
#    known; resize2fs_once then fills the new space on first boot.
if [ -f "$CMDLINE" ]; then
  log "removing first-boot reboot (init=firstboot) from cmdline.txt"
  sed -i \
    -e 's| init=/usr/lib/raspberrypi-sys-mods/firstboot||' \
    -e 's| systemd\.run=[^ ]*||g' \
    -e 's| systemd\.run_success_action=reboot||g' \
    -e 's| systemd\.unit=kernel-command-line\.target||g' \
    "$CMDLINE"
fi

# 2. Trim config.txt to a headless-server profile. Stock config.txt is tuned
#    for a desktop: it loads the full KMS graphics stack, enables audio, and
#    probes for cameras / DSI displays — none of which a kitchen server uses,
#    and each costs init time (and RAM) on a 512 MB Zero W. An overlay can't be
#    un-loaded by a later line, so the heavy ones are commented out in place;
#    the auto-probes are flipped off and our settings appended under [all]. The
#    legacy framebuffer console still backs the stock getty login on tty1
#    without vc4-kms-v3d.
CONFIG="$MOUNT_ROOT/boot/firmware/config.txt"
if [ -f "$CONFIG" ]; then
  log "trimming config.txt for headless fast boot"
  sed -i \
    -e 's/^dtoverlay=vc4-kms-v3d/#&/' \
    -e 's/^max_framebuffers=2/#&/' \
    -e 's/^dtparam=audio=on/#&/' \
    -e 's/^camera_auto_detect=1/camera_auto_detect=0/' \
    -e 's/^display_auto_detect=1/display_auto_detect=0/' \
    -e 's/^auto_initramfs=/#&/' \
    "$CONFIG"
  if ! grep -q "Pantry Host fast-boot" "$CONFIG"; then
    cat >> "$CONFIG" <<'CFG'

# --- Pantry Host fast-boot (headless appliance) ---
# No display/audio/camera/bluetooth on a kitchen server; skip the splash and
# the fixed boot delay, and disable the on-chip Bluetooth (frees the PL011
# UART and skips hciuart). Comment dtoverlay=disable-bt if you later need BT.
disable_splash=1
boot_delay=0
dtoverlay=disable-bt
# Skip the ~10 MB initramfs decompress on every boot. The root drivers
# (ext4/mmc/sdhost) are built into both the stock and the custom kernel, so the
# initramfs has nothing to do. Validated stable on-device.
auto_initramfs=0
CFG
  fi
  # Boot the custom kernel when one was injected, leaving the stock kernel.img
  # untouched as the rollback fallback (revert by removing this line or
  # restoring config.txt.bak). Appended outside the static block so --no-kernel
  # images never point at a kernel that isn't there.
  if [ -n "$KERNEL_RELEASE" ] && ! grep -q '^kernel=kernel-pantry.img' "$CONFIG"; then
    log "selecting custom kernel in config.txt (kernel=kernel-pantry.img)"
    printf '\n# Pantry Host custom kernel (stock kernel.img kept as fallback)\nkernel=kernel-pantry.img\n' >> "$CONFIG"
  fi
fi

# Blacklist headless-irrelevant modules so udev coldplug never autoloads them
# on the stock kernel (the custom kernel compiles them out entirely; the file
# is harmless there). Audio, camera/V4L2, and the DRM/vc4 graphics stack have
# no use on a headless server and each costs coldplug time + RAM on the 512 MB
# Zero W.
log "blacklisting audio/camera/v4l2/drm modules"
cat > "$MOUNT_ROOT/etc/modprobe.d/pantry-headless.conf" <<'BLACKLIST'
# Pantry Host — headless appliance: don't autoload display/audio/camera stacks.
blacklist snd_bcm2835
blacklist snd_soc_core
blacklist bcm2835_codec
blacklist bcm2835_isp
blacklist bcm2835_v4l2
blacklist v4l2_common
blacklist videobuf2_common
blacklist vc4
blacklist v3d
blacklist drm_kms_helper
blacklist drm
BLACKLIST

# 3. Mask services stock Pi OS Lite enables but a headless pantry server never
#    uses. Masking (symlink → /dev/null) is the offline-safe `systemctl mask`:
#    a masked unit can't start even if something Wants it.
#      - NetworkManager-wait-online: the boot barrier we just decoupled
#        pantry-server from; masking keeps anything else from serializing boot
#        behind a DHCP lease.
#      - bluetooth/hciuart: paired with dtoverlay=disable-bt above.
#      - ModemManager/triggerhappy/rpi-eeprom-update/e2scrub: no modem, no GPIO
#        hotkeys, no EEPROM bootloader on a Zero W, no LVM to scrub.
#      - timers: not boot-critical, but masking them spares the slow SD a
#        post-boot I/O storm (apt indexing, man-db, db backup).
#      - console-setup: THE first-boot win. On a single ARMv6 core, the very
#        first boot is CPU-contention-bound, not work-bound: nearly every unit's
#        systemd-analyze "blame" is inflated because it's queued behind the one
#        genuine CPU hog — console-setup compiling the console font + keymap
#        (~70s wall on first boot; sub-second once its /etc/console-setup cache
#        exists). On-device this dwarfs everything and starves avahi/NM/logind/
#        sshswitch of the core, so masking it doesn't just save its own time, it
#        lets the units that DO matter run ~20s sooner. The payoff is purely a
#        first-boot one: a flashed card a user powers on once paid ~70s here.
#        We can afford to drop it because tty1 only shows the stock getty login
#        (used only if a monitor is ever plugged into this headless box) — the
#        kernel's built-in 8x16 font renders that fine. (To keep a custom console
#        font instead, run `setupcon --save-only` in the chroot above to pre-bake
#        the cache rather than masking — but on a headless box there's nothing to
#        gain.)
#      - keyboard-setup: compiles the console keymap during sysinit, and unlike
#        console-setup it sits ON the sysinit critical path (~3s here, measured
#        on-device), so it delays NetworkManager/WiFi bring-up — i.e. it pushes
#        out time-to-web, not just total boot. A headless appliance has no
#        attached keyboard. XKBLAYOUT is still written to /etc/default/keyboard
#        above, so it applies verbatim if a maintainer ever unmasks this for an
#        Alt+F2 debug VT.
#      - udisks2: removable-media automount daemon; nothing plugs disks into a
#        kitchen server, and it's a heavy first-boot CPU competitor (~38s wall).
#      - dphys-swapfile: removed from boot in the boot-time profiling pass that
#        built the custom kernel, to free CPU/IO on the single core. Its
#        steady-state cost is only the swapon (the swapfile already exists after
#        first boot), so the boot win is marginal — we fold it in as part of
#        that pass. TRADEOFF: no swap means a large image upload could OOM on a
#        512 MB Zero W. The server mitigates with IMAGE_CONCURRENCY=1, and
#        ENABLE_IMAGE_PROCESSING can be set false on a Pi. Unmask this if you
#        hit OOM-kills under the image variant pipeline.
#      - nfs-client.target / rpc-statd-notify: the NFS client stack, enabled by
#        default on Pi OS. We mount nothing over NFS (rpcbind already disabled),
#        so it only adds rpc-statd-notify + run-rpc_pipefs.mount to the
#        pre-network boot path on the single core. Masking the target detaches
#        them; unmask if you ever mount an NFS share.
#      - sys-kernel-debug.mount: debugfs. ~0.5s on the slow SD during sysinit,
#        before NetworkManager can start. Nothing in the appliance reads it
#        (tracing is compiled out of the custom kernel). Unmask if you need
#        kernel debug interfaces for diagnosis.
#    Deliberately NOT masked: resize2fs_once (load-bearing: grows the rootfs
#    onto the user's card on first boot — SHRINK_ROOTFS is currently a no-op,
#    but this is stock Pi OS's own resize and must stay), avahi-daemon (resolves
#    pantry.local — the whole point), and wpa_supplicant (NetworkManager drives
#    WiFi through it via D-Bus; masking it kills WiFi).
log "masking unused services for faster boot"
for unit in \
  NetworkManager-wait-online.service \
  ModemManager.service \
  triggerhappy.service \
  rpi-eeprom-update.service \
  bluetooth.service \
  hciuart.service \
  console-setup.service \
  keyboard-setup.service \
  udisks2.service \
  dphys-swapfile.service \
  nfs-client.target \
  rpc-statd-notify.service \
  sys-kernel-debug.mount \
  e2scrub_reap.service \
  e2scrub_all.timer \
  apt-daily.timer \
  apt-daily-upgrade.timer \
  man-db.timer \
  dpkg-db-backup.timer; do
  ln -sf /dev/null "$MOUNT_ROOT/etc/systemd/system/$unit"
done

# Enable WiFi in NetworkManager — only on the no-creds (captive-portal) path.
# When $WIFI_SSID is baked in, NM is masked above and this is moot.
#
# Stock Pi OS Lite ships /var/lib/NetworkManager/NetworkManager.state with
# WirelessEnabled=false — the radio is software-disabled at the NM level until
# something flips it on. Normally `raspi-config nonint do_wifi_country` does
# that (via `nmcli radio wifi on`, or — when NM isn't running, e.g. offline like
# here — by editing this flag directly). NM owns the rfkill soft-block and
# re-asserts it from WirelessEnabled at every startup, so this flag is the whole
# fix: NM unblocks the radio itself once WiFi is enabled. (An external `rfkill
# unblock` is pointless — NM clobbers it back to blocked while
# WirelessEnabled=false.)
if [ -z "$WIFI_SSID" ]; then
  NM_STATE="$MOUNT_ROOT/var/lib/NetworkManager/NetworkManager.state"
  if [ -f "$NM_STATE" ]; then
    log "enabling WiFi in NetworkManager (WirelessEnabled=true)"
    sed -i 's/^WirelessEnabled=.*/WirelessEnabled=true/' "$NM_STATE"
  else
    log "creating NetworkManager.state with WiFi enabled"
    install -d -m 755 "$MOUNT_ROOT/var/lib/NetworkManager"
    printf '[main]\nWirelessEnabled=true\n' > "$NM_STATE"
  fi
fi

# Enable SSH unconditionally — the user may not have set keys, but we still
# want to be able to reach the device if WiFi works. The /boot/firmware/ssh
# marker is Pi OS's canonical "turn SSH on" switch; we also drop the
# wants-symlink directly so ssh.service comes up on the first (and only) boot
# even if the marker mechanism shifts upstream.
touch "$MOUNT_ROOT/boot/firmware/ssh"
ln -sf /lib/systemd/system/ssh.service \
  "$MOUNT_ROOT/etc/systemd/system/multi-user.target.wants/ssh.service" 2>/dev/null || true

# SSH host keys: ed25519 only ------------------------------------------------
# Pi OS regenerates host keys on first boot — that's the ~30s blue "Generating
# SSH keys..." screen. The work runs `ssh-keygen -A` (RSA + ECDSA + ED25519),
# and the RSA-3072 keygen alone is what burns the time on a single-core ARMv6
# Pi. Every ssh client this decade speaks ed25519 and its keygen is instant,
# so we only want that one key type.
#
# Two paths share ONE script, /usr/lib/raspberrypi-sys-mods/regenerate_ssh_host_keys:
#   1. the initramfs `firstboot` (cmdline `init=…/firstboot`) calls it directly
#      behind the blue screen, then reboots;
#   2. regenerate_ssh_host_keys.service runs it again on the next boot, then
#      `systemctl disable`s itself.
# Patching this single script covers both. (Masking the .service does nothing
# for path 1 — firstboot invokes the script directly, not via systemd.) The
# key is still generated per-device on first boot, not baked into the image.
log "patching SSH host-key regen to ed25519-only"
REGEN_SCRIPT="$MOUNT_ROOT/usr/lib/raspberrypi-sys-mods/regenerate_ssh_host_keys"
if [ -f "$REGEN_SCRIPT" ]; then
  # Same shape as the stock script (rm stale keys, generate, self-disable) —
  # only the keygen line changes from `ssh-keygen -A` to ed25519-only.
  cat > "$REGEN_SCRIPT" <<'REGEN'
#!/bin/sh -e

rm -f /etc/ssh/ssh_host_*_key*
ssh-keygen -q -t ed25519 -f /etc/ssh/ssh_host_ed25519_key -N "" >/dev/null
systemctl -q disable regenerate_ssh_host_keys
REGEN
  chmod 0755 "$REGEN_SCRIPT"
else
  warn "regenerate_ssh_host_keys script not found — SSH keygen left at Pi OS default"
fi

# Make sure the prebaked user owns its home + server dir. The account was
# created/finished in the chroot above (UID/GID 1000 — the Bookworm default
# for the first regular user, `pi`), but the binary and server dir were
# dropped in as root, so chown the tree to match.
chown -R 1000:1000 "$MOUNT_ROOT/home/$USERNAME"

# Final sync + unmount happen in cleanup() via the EXIT trap.
sync
log "customization complete"
