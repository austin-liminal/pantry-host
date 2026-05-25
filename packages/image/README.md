# `packages/image` — flashable Pantry Host SD-card image

Builds a Raspberry Pi OS Lite image with `pantry-server`, Tailscale, and
auto-WiFi baked in. `dd` the result onto a microSD card, plug it into a Pi
Zero W, and power on.

> **First-cut scope:** original Pi Zero W (ARMv6, 512 MB). Pi Zero 2 W /
> Pi 3 / Pi 4 will follow once the binary is built for those targets and
> `build.sh` learns a `--target` flag.
>
> **Captive portal:** WiFi credentials currently come from `.env.image`
> (gitignored). Replacing that with a captive-portal first-boot flow is a
> follow-up — track in the project's roadmap.

## Prereqs

- Docker (Desktop on macOS, or Engine on Linux). `--privileged` containers
  must be allowed.
- `curl`, `xz`, `shasum` on the host.
- About 8 GB free disk. The Pi OS Lite image expands to ~3 GB and we keep a
  staging copy + a compressed output.

## One-time setup

```bash
cp packages/image/.env.image.example packages/image/.env.image
$EDITOR packages/image/.env.image
```

The fields you have to fill in:

| Var                  | Why                                            |
|----------------------|------------------------------------------------|
| `WIFI_SSID`          | Network the Pi joins on first boot             |
| `WIFI_PSK`           | WPA2 password for that network                 |
| `WIFI_COUNTRY`       | 2-letter regulatory domain (e.g. `US`, `GB`)   |
| `USER_PASSWORD`      | Initial user password (gets hashed at build)   |
| `SSH_AUTHORIZED_KEYS`| Optional — set instead of (or with) a password |

Everything else has a sensible default. `HOSTNAME` defaults to `pantry`
(reachable at `pantry.local` over mDNS); `USERNAME` defaults to `pi`
because the bundled systemd unit is pinned to that user.

## Build

```bash
cd packages/image
./build.sh
```

The first run will:

1. Cross-compile `pantry-server` for `arm-unknown-linux-gnueabihf` via the
   existing `packages/server/scripts/build-pi.sh armv6` pipeline. This is
   slow the first time (~5 minutes on an M-series Mac), nearly instant
   thereafter.
2. Cross-compile a stripped ARMv6 **custom kernel** from `raspberrypi/linux`
   in its own container (`Dockerfile.kernel`). The source tree + ccache are
   cached in `work/cache/`, so the first build is slow (clone + full compile)
   and later builds are incremental. See **Custom kernel** below.
3. Download Raspberry Pi OS Lite (32-bit, armhf, Bookworm) into
   `work/cache/`. Cached across runs.
4. Download the latest stable Tailscale `armhf` `.deb` from
   `pkgs.tailscale.com`. Cached across runs.
5. Spin up a privileged Linux container, loop-mount the Pi OS image,
   inject `pantry-server` + Tailscale (via `chroot` + `qemu-user-static`) +
   the custom kernel, and bake in all system config (hostname, WiFi, timezone,
   keyboard, user account) offline, then unmount.
6. Compress and checksum the result into
   `dist/pantry-host-pi-zero-w-YYYYMMDD-HHMMSS.img.xz`.

Re-runs reuse the cached Pi OS image automatically — it's only downloaded when
missing; pass `--force-pi-os` to re-fetch a fresh copy. The `pantry-server`
binary is rebuilt each run unless you pass `--skip-binary` to reuse
`packages/server/dist/pi/pantry-server-armv6`. The custom kernel rebuilds
incrementally each run; pass `--skip-kernel` to reuse the cached artifacts,
`--force-kernel` to fetch + rebuild from scratch, or `--no-kernel` to ship the
stock Pi OS kernel instead.

### Flags

```
--skip-binary    Reuse packages/server/dist/pi/pantry-server-armv6 if present.
--skip-pi-os     Require the cached Pi OS image; never download.
--force-pi-os    Re-download the Pi OS image even if a cached copy exists.
--no-kernel      Ship the stock Pi OS kernel (skip the custom kernel + inject).
--skip-kernel    Require the cached custom kernel; never (re)build it.
--force-kernel   Git-fetch the ref and fully rebuild the custom kernel.
--no-compress    Leave the raw .img next to .img.xz (faster dd, larger file).
--no-shrink      Skip the rootfs shrink; ship the full ~2.4 GB image.
```

## Flash

The companion `flash.sh` does the whole dance for you — it lists each
candidate disk with its size and free space (so you can pick out the SD
card), verifies the image checksum, unmounts the disk, and `dd`s the image
onto it (raw device on macOS for speed):

```bash
cd packages/image
./flash.sh                 # newest dist/*.img(.xz), then choose a disk
./flash.sh path/to.img.xz  # flash a specific image
./flash.sh --all           # also list internal/fixed disks (careful)
```

It defaults to external/removable disks only and makes you type the chosen
disk identifier (e.g. `disk6`) to confirm before erasing it. Handles both
`.img` and `.img.xz` inputs. Run `./flash.sh --help` for all flags.

If you'd rather flash by hand, `build.sh` also prints the exact `dd`
invocation when it finishes. The generic form on macOS:

```bash
diskutil list                                # find your SD card (e.g. /dev/disk6)
diskutil unmountDisk /dev/disk6
xzcat dist/pantry-host-pi-zero-w-*.img.xz \
  | sudo dd of=/dev/rdisk6 bs=4M status=progress conv=fsync
sync && diskutil eject /dev/disk6
```

> Use `/dev/rdiskN` (raw device) on macOS — `/dev/diskN` is 10–20× slower.
> Be **certain** of the device number; `dd` will happily overwrite your
> internal drive.

On Linux:

```bash
lsblk                                        # find your SD card
sudo umount /dev/sdX*                        # if anything auto-mounted
xzcat dist/pantry-host-pi-zero-w-*.img.xz \
  | sudo dd of=/dev/sdX bs=4M status=progress conv=fsync
sync
```

## First boot

Plug the card in, power on. There's **no first-boot configuration pass and
no reboot** — hostname, WiFi, timezone, keyboard, and the user account are
all baked into the image at build time, so the Pi boots **once**, straight
into the normal multi-user target:

1. NetworkManager auto-connects to the baked WiFi profile
   (`/etc/NetworkManager/system-connections/preconfigured.nmconnection`).
   The regulatory domain is set via the `cfg80211.ieee80211_regdom` kernel
   param appended to `cmdline.txt`.
2. `pantry-server.service` starts — enabled offline via its
   `multi-user.target.wants` symlink. `pantry-server`
   listens on port `80` (standard HTTP) and serves both the GraphQL API and
   the embedded Rex SPA; the systemd drop-in
   (`pantry-server.service.d/pi-image.conf`) grants `CAP_NET_BIND_SERVICE`
   so it binds port 80 without running as root. `tailscaled` does **not**
   start at boot — it's deferred until the installer's Tailscale step needs
   it (see **Boot-time tuning** below).
3. SSH comes up (the `/boot/firmware/ssh` marker plus an explicit
   `ssh.service` wants-symlink). Only a single **ed25519** host key is
   generated: `customize.sh` rewrites Pi OS's shared
   `regenerate_ssh_host_keys` script to emit ed25519 only, dropping the
   RSA-3072 keygen that otherwise burns ~30s. It runs inline via
   `regenerate_ssh_host_keys.service` (ordered `Before=ssh.service`), which
   self-disables after the first boot.

`customize.sh` also strips Pi OS's
`init=/usr/lib/raspberrypi-sys-mods/firstboot` from `cmdline.txt` — stock
`firstboot` ends in an unconditional `reboot -f`, so the card was silently
paying a full extra cold-boot cycle. Without it the Pi boots straight into
multi-user. Combined with the headless `config.txt` trim and decoupling
`pantry-server` from `network-online.target` (see **Boot-time tuning** below),
power-on to `http://pantry.local` is **~20–30s**. That's the practical floor
for this board: WiFi association plus the ARMv6 kernel/systemd bring-up
dominate and aren't software-tunable much below ~20s. Then:

```bash
# Find the Pi
ping pantry.local                            # or check your router's DHCP table
ssh pi@pantry.local                          # password from .env.image

# In a browser
open http://pantry.local
```

The first time you load the SPA, the in-app installer flow steps through
Tailscale auth and any other one-time configuration. Because `tailscaled` is
deferred off boot, the server first runs `sudo systemctl start tailscaled`
(pi's NOPASSWD sudo authorizes it), then invokes
`tailscale up --operator=$USERNAME` — the control socket is world-rw, so the
unprivileged `up` drives the just-started daemon directly. Once auth succeeds
the server runs `sudo systemctl enable tailscaled` so the tunnel restores on
every later boot, and the user can run `tailscale status`, `tailscale logout`,
etc. without `sudo`.

## What's baked into the image

```
/home/pi/server/pantry-server                 (3 MB Rust binary)
/usr/local/bin/pantry-server                  (symlink to above)
/etc/systemd/system/pantry-server.service     (from packages/server/scripts/)
/etc/systemd/system/pantry-server.service.d/pi-image.conf
                                              (GRAPHQL_PORT=80, CAP_NET_BIND_SERVICE,
                                               TAILSCALE_OPERATOR=$USERNAME)
/usr/sbin/tailscaled, /usr/bin/tailscale      (apt-installed Tailscale)
/etc/hostname, /etc/hosts                     (hostname)
/etc/NetworkManager/system-connections/preconfigured.nmconnection  (WiFi)
/etc/localtime, /etc/timezone, /etc/default/keyboard  (locale)
/boot/firmware/cmdline.txt                    (+ cfg80211.ieee80211_regdom=<country>)
/boot/firmware/kernel-pantry.img              (stripped ARMv6 custom kernel; stock kernel.img kept)
/lib/modules/<release>-pantry-v6/             (custom-kernel modules)
/boot/firmware/config.txt                     (kernel=kernel-pantry.img, auto_initramfs=0, headless)
/etc/modprobe.d/pantry-headless.conf          (blacklist audio/camera/v4l2/drm)
```

Everything else is stock Raspberry Pi OS Lite (Bookworm, 32-bit armhf). The
custom kernel is built from `raspberrypi/linux` and skipped with `--no-kernel`
(see **Custom kernel** below).

## Boot-time tuning

`customize.sh` bakes several boot speedups offline (all reversible by editing
the script). They take a stock ~30–45s first boot down to a sub-30s single
boot, the custom kernel being the biggest lever:

- **Stripped custom kernel.** WiFi (`brcmfmac` + SDIO) and the root storage
  drivers (`mmc`/`sdhost`/`ext4`) are compiled *into* the kernel (`=y`) instead
  of loaded as modules by udev. On the single ARMv6 core, stock `brcmfmac`
  isn't `modprobe`d until ~25s into boot; built-in it initializes during kernel
  boot (~3–4s), so WiFi associates ~20s sooner — and WiFi association is the
  reachability gate. The kernel is also stripped of everything a headless box
  never uses (DRM/vc4, sound, camera/V4L2, USB gadget, tracing) and LZ4-packed
  for a faster decompress. See **Custom kernel** below; `--no-kernel` ships
  stock instead.
- **No initramfs.** `auto_initramfs=0` in `config.txt` skips the ~10 MB
  initramfs decompress on every boot. The root drivers are built into both the
  stock and the custom kernel, so the initramfs has nothing to do. (Validated
  stable on-device over many hours.)
- **No first-boot reboot.** Stock Pi OS boots through
  `init=/usr/lib/raspberrypi-sys-mods/firstboot`, which regenerates SSH keys,
  randomizes the partuuid, then `reboot -f`s — a whole extra cold-boot cycle.
  The keygen is already handled by `regenerate_ssh_host_keys.service` and a
  per-device partuuid is moot for a single-board appliance, so the firstboot
  init is stripped from `cmdline.txt`. No rootfs resize is lost — this Bookworm
  `firstboot` doesn't resize, and the image ships at its built size rather than
  expanding to fill the card.
- **`pantry-server` no longer waits for the network.** Its unit depends on
  `network.target`, not `network-online.target`, and
  `NetworkManager-wait-online.service` is masked — so boot isn't serialized
  behind a DHCP lease (10–30s on WiFi). The server binds `0.0.0.0:80` the
  moment it starts; clients reach it as soon as WiFi associates.
- **Headless `config.txt`.** The KMS graphics stack (`vc4-kms-v3d`,
  `max_framebuffers=2`), audio, and the camera/display auto-probes are
  disabled; `disable_splash=1`, `boot_delay=0`, and `dtoverlay=disable-bt` are
  added. The legacy framebuffer still backs the stock `getty` login on tty1.
  Audio/camera/V4L2/DRM modules are also blacklisted via
  `/etc/modprobe.d/pantry-headless.conf` (a no-op on the custom kernel, which
  compiles them out, but it keeps the stock kernel from coldplugging them).
- **Masked services.** `ModemManager`, `triggerhappy`, `rpi-eeprom-update`,
  `bluetooth`/`hciuart`, `e2scrub`, the apt / man-db / dpkg-backup timers,
  `console-setup` + `keyboard-setup` (no display/keyboard — `console-setup` is
  the dominant *first*-boot win at ~70s of one-time font/keymap compile;
  `keyboard-setup` is ~3s but sits on the sysinit critical path, so masking it
  pulls in WiFi/time-to-web), `udisks2` (removable-media automount; a heavy
  first-boot CPU competitor), and `dphys-swapfile` are masked. **Kept on
  purpose:** `avahi-daemon` (it answers `pantry.local`). Note: there's **no
  swap** — `dphys-swapfile` was dropped in the boot-time pass. A large image
  upload could OOM on 512 MB; the server mitigates with `IMAGE_CONCURRENCY=1`
  and `ENABLE_IMAGE_PROCESSING=false`. Unmask `dphys-swapfile` if you hit
  OOM-kills. (A previous build also tailed the server log onto tty1 via
  `pantry-console.service`; that was removed — a continuous `journalctl
  --follow` steals the one core, and the box is headless.)
- **Tailscale deferred off boot.** `tailscaled` (~8s on a Zero W, and on the
  `multi-user.target` critical chain) is installed but *not* enabled at boot —
  it's pure overhead until the device is linked. The installer's Tailscale step
  starts it on demand and enables it for future boots only after a successful
  link (see **First boot** above). On a measured Zero W this drops total boot
  from ~35s to ~30s with **no** change to time-to-web (tailscaled activated
  ~8s *after* the SPA was already reachable).

Single-digit boot isn't reachable on a Zero W over WiFi — that needs a faster
board (Zero 2 W) or wired Ethernet (Pi 3/4). Profile any further tuning
on-device with `systemd-analyze blame` and `systemd-analyze critical-chain`.

## Custom kernel

The image boots a stripped ARMv6 kernel built from the
[`raspberrypi/linux`](https://github.com/raspberrypi/linux) fork (so the
RPi-specific `sdhost`/`brcmfmac`/device-tree support is retained) rather than
Pi OS's stock kernel. The point is **time-to-WiFi**: building `brcmfmac` and the
root storage drivers in (`=y`) initializes them during kernel boot instead of
via a ~25s-late udev `modprobe`, pulling WiFi association ~20s earlier on the
single core. Everything a headless server never touches is stripped (DRM/vc4,
sound, camera/V4L2, USB gadget, RAID/MD, tracing, KASLR), and the image is
LZ4-packed for a faster decompress. Netfilter/`tun`/conntrack (Tailscale),
IPv6, FUSE, and **rfkill** are deliberately kept — rfkill in particular is
load-bearing for the NetworkManager WiFi-unblock path.

### How it's built

```
packages/image/kernel/
├── pantry-armv6.config   # Kconfig fragment (built-in vs strip list)
├── build-kernel.sh       # clone/config/build/stage, runs in the container
└── deploy-live.sh        # push a built kernel to a live Pi for testing
packages/image/Dockerfile.kernel   # cross-compile toolchain (separate from the customizer)
```

`build.sh`'s kernel stage builds `Dockerfile.kernel`, then runs
`build-kernel.sh` inside it: it shallow-clones `raspberrypi/linux` into
`work/cache/linux`, merges `pantry-armv6.config` over `bcm2835_defconfig`,
`make olddefconfig`, and builds `zImage` + dtbs + modules. The source tree and
a ccache live in `work/cache/`, so the first build is slow (clone + full
compile) and later builds are incremental. Artifacts stage to
`work/cache/kernel-out/` (`kernel-pantry.img`, a `kmod/` module tree, and a
`kernelrelease` file). `customize.sh` then copies the kernel in as
`kernel-pantry.img`, drops the modules under `/lib/modules/<release>`, runs
`depmod`, sets `kernel=kernel-pantry.img` in `config.txt`, and `apt-mark hold`s
the kernel/firmware packages. **The stock `kernel.img` is left in place as a
fallback.**

### Testing on a live Pi (rollback-safe)

Before baking a new kernel into the image, validate it on a running device:

```bash
cd packages/image
./build.sh --skip-binary --skip-pi-os    # build just the kernel into work/cache/kernel-out/
./kernel/deploy-live.sh pi@pantry.local  # copy kernel + modules, set config.txt (backs up to .bak)
ssh pi@pantry.local 'sudo reboot'
# wait a couple of minutes (a new kernel's first boot is slower than later ones)
./verify.sh pantry.local                 # measure time-to-HTTP; confirm < 30s
```

If the board doesn't come back, SD-mount the card on another machine and
restore `config.txt.bak` (it points back at the stock `kernel.img`) — no
re-flash needed.

### Maintenance

The product ships as a built image, so a "kernel update" is just a rebuild from
RPi's stable branch at image-rebuild time — there's no on-device kernel package
to track. `apt-mark hold` keeps `apt upgrade` from clobbering the setup. Match
`KERNEL_REF` (default `rpi-6.12.y`, set in `build-kernel.sh`) to the device's
running `uname -r` major.minor when bumping. If `bcm2835_defconfig` ever stops
satisfying a needed `=y` driver, rebase the fragment on `bcmrpi_defconfig`
(RPi's downstream ARMv6 config) — `build-kernel.sh` warns at configure time if
a load-bearing symbol didn't land as built-in.

## Troubleshooting

- **WiFi doesn't come up:** check the baked NM profile with
  `nmcli connection show preconfigured` and the regulatory domain with
  `iw reg get` (should match `WIFI_COUNTRY`). The profile must be `0600` +
  root-owned or NetworkManager ignores it.
- **pantry-server log:** `journalctl -u pantry-server` (or `-f` to tail).
- **`docker run` returns "operation not permitted":** Docker Desktop on
  macOS needs the *Allow privileged containers* setting (Settings →
  Advanced) toggled on. Linux engines need to run `build.sh` as a user in
  the `docker` group.
- **`losetup: cannot find free loop device`:** rare on macOS; restarting
  Docker Desktop usually clears it.
- **Build takes forever inside the container:** the Tailscale dpkg install
  runs through QEMU emulation (host arch ≠ armhf). It's a one-time cost
  per image build and typically wraps in 2–3 minutes.

## Why ARMv6 and not Pi Zero 2 W?

The Pi Zero W (BCM2835, ARMv6 + VFPv2) is the floor. If we can run on it,
every newer Pi runs on it. Pi Zero 2 W / Pi 3 / Pi 4 will get their own
build variants once we extend `build.sh` with a `--target` flag — the
cross-compile infrastructure in `packages/server/scripts/build-pi.sh`
already produces `armv7` and `arm64` binaries.
