#!/usr/bin/env bash
# Start HTTPS reverse proxies for iOS camera access (requires mkcert certs)
CERT="$HOME/Sites/jpdevries/localhost+2.pem"
KEY="$HOME/Sites/jpdevries/localhost+2-key.pem"

if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
  echo "Missing mkcert certs at $CERT / $KEY"
  exit 1
fi

echo "Starting HTTPS proxies..."
echo "  https://localhost:3443 -> http://localhost:3000 (Rex)"
echo "  https://localhost:4444 -> http://localhost:4001 (GraphQL)"

local-ssl-proxy --source 3443 --target 3000 --cert "$CERT" --key "$KEY" &
PID1=$!
local-ssl-proxy --source 4444 --target 4001 --cert "$CERT" --key "$KEY" &
PID2=$!

trap "kill $PID1 $PID2 2>/dev/null" EXIT
echo "Proxies running. Press Ctrl+C to stop."
wait
