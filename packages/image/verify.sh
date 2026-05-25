#!/usr/bin/env bash
# verify.sh — poll a freshly-booted Pi until pantry-server actually answers.
#
#   ./verify.sh                       # poll pantry.local for up to 120s
#   ./verify.sh 192.168.86.206        # by IP — use this if .local/mDNS won't resolve
#   ./verify.sh pantry2.local         # another mDNS name
#   ./verify.sh 100.78.11.102         # works over Tailscale too
#   TIMEOUT=60 ./verify.sh            # override the deadline (seconds)
#   ./verify.sh --from-down <host>    # wait for it to go DOWN first, then time recovery
#
# Confirms the responder is really pantry-server: it POSTs a GraphQL probe to
# /graphql and checks the typed reply, rather than accepting any HTTP status on
# `/`. That matters because the server 307-redirects `/`→`/setup`, and because a
# stray LAN responder or captive portal can return a 200/redirect for a name
# whose host is actually down — both of which a plain `curl /` mistakes for a
# healthy boot. On success it prints the IP it reached.
#
# Note: `.local` names need working mDNS on the machine running this. If a name
# won't resolve, pass the LAN IP instead (find it via your router or
# `arp -a | grep b8:27:eb` for a Pi).

set -euo pipefail

log()  { echo "==> $*"; }
die()  { echo "error: $*" >&2; exit 1; }

FROM_DOWN=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --from-down) FROM_DOWN=1 ;;
    -h|--help) sed -n '2,/^$/p' "$0" | sed 's|^# \{0,1\}||'; exit 0 ;;
    *) ARGS+=("$a") ;;
  esac
done

HOST="${ARGS[0]:-pantry.local}"
TIMEOUT="${TIMEOUT:-120}"
GRAPHQL="http://${HOST}/graphql"

command -v curl >/dev/null || die "curl not found on PATH"

# probe — returns 0 iff pantry-server's GraphQL endpoint answers our query, and
# sets RESP_IP to the address curl actually reached. The body must contain the
# typed reply ({"data":{"__typename":"Query"}}), so a generic 200, a redirect,
# or an unresolvable name all count as "not up".
RESP_IP=""
probe() {
  local resp meta
  resp=$(curl -s --connect-timeout 3 --max-time 5 \
           -w $'\n%{remote_ip}' \
           -X POST "$GRAPHQL" -H 'content-type: application/json' \
           --data '{"query":"{__typename}"}' 2>/dev/null) || return 1
  meta=$(printf '%s' "$resp" | tail -n1)          # last line = remote IP
  case "$resp" in
    *'"__typename"'*|*'"data"'*) RESP_IP="$meta"; return 0 ;;
    *) return 1 ;;
  esac
}

start=$(date +%s)
deadline=$(( start + TIMEOUT ))

# Reboot gate: wait until the old server stops answering before timing the
# recovery, so we measure the NEW boot and not the box on its way down.
if (( FROM_DOWN )); then
  log "waiting for ${HOST} to stop responding before timing recovery…"
  while probe; do
    (( $(date +%s) >= deadline )) && die "still responding after ${TIMEOUT}s — did it actually reboot?"
    sleep 1
  done
  log "${HOST} is down; starting the clock"
  start=$(date +%s)
  deadline=$(( start + TIMEOUT ))
fi

log "waiting for pantry-server at ${HOST} (timeout ${TIMEOUT}s)"
attempt=0
while :; do
  attempt=$(( attempt + 1 ))

  if probe; then
    elapsed=$(( $(date +%s) - start ))
    log "pantry-server responded after ${elapsed}s (IP ${RESP_IP:-?}, ${attempt} attempt(s))"
    exit 0
  fi

  now=$(date +%s)
  if (( now >= deadline )); then
    elapsed=$(( now - start ))
    die "no pantry-server response after ${elapsed}s (${attempt} attempt(s)). If the box is up but ${HOST} won't resolve, retry with its LAN IP."
  fi
  sleep 1
done
