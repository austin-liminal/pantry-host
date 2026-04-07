#!/bin/bash
# Syncs video and poster files from public/videos/ to the R2 bucket.
# Run from the repo root during CI build.
#
# Strategy: only upload files whose content has changed since the last run.
# We use the git-LFS object ID (which is the file's SHA256) as the content
# fingerprint, and store a manifest object inside the same R2 bucket at
# `_sync-manifest.json` mapping { "<key>": "<oid>" } for everything we've
# uploaded. Each run:
#   1. Build the desired { key -> oid } map from `git lfs ls-files -l`,
#      falling back to `sha256sum` for any non-LFS files (e.g. posters).
#   2. Fetch the existing manifest from R2 (treat 404 as empty).
#   3. PUT only the files whose oid differs from the manifest.
#   4. Write the new manifest back to R2 if anything changed.
#
# The manifest is self-healing: if it's missing or corrupt the worst case
# is one full re-sync (the original behavior).

set -e

BUCKET="pantry-host-videos"
VIDEO_DIR="packages/marketing/public/videos"
MANIFEST_KEY="_sync-manifest.json"

if [ ! -d "$VIDEO_DIR" ]; then
  echo "No videos directory found at $VIDEO_DIR — skipping R2 sync."
  exit 0
fi

# Require jq for manifest manipulation. (Preinstalled on the Cloudflare
# Pages build image; if a future runner lacks it, swap to a node one-liner.)
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for incremental sync but was not found on PATH." >&2
  exit 1
fi

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

old_manifest="$tmpdir/old.json"
new_manifest="$tmpdir/new.json"

# 1. Pull the existing manifest from R2 (404 → empty object).
if npx wrangler r2 object get "$BUCKET/$MANIFEST_KEY" --remote --pipe \
     > "$old_manifest" 2>/dev/null && [ -s "$old_manifest" ]; then
  # Validate JSON; if it's garbage, treat as empty.
  if ! jq -e . "$old_manifest" >/dev/null 2>&1; then
    echo "  Manifest is not valid JSON, starting fresh."
    echo '{}' > "$old_manifest"
  fi
else
  echo "  No existing manifest in R2, starting fresh."
  echo '{}' > "$old_manifest"
fi

cp "$old_manifest" "$new_manifest"

# 2. Build the desired { key -> oid } map.
desired_keys="$tmpdir/desired-keys.txt"   # one "key|oid|path" per line
: > "$desired_keys"

# 2a. LFS-tracked files: oid is free.
#     `git lfs ls-files -l` prints "<oid> <*|-> <path>".
#     The `*` means the file is checked out; `-` means pointer-only.
while IFS= read -r line; do
  [ -z "$line" ] && continue
  oid=$(echo "$line" | awk '{print $1}')
  status=$(echo "$line" | awk '{print $2}')
  path=$(echo "$line" | awk '{for (i=3; i<=NF; i++) printf "%s%s", $i, (i<NF ? OFS : "")}')
  case "$path" in
    "$VIDEO_DIR"/*.mp4 | "$VIDEO_DIR"/*.webm)
      key=$(basename "$path")
      ;;
    "$VIDEO_DIR"/posters/*.jpg)
      key="posters/$(basename "$path")"
      ;;
    *)
      continue
      ;;
  esac
  if [ "$status" != "*" ]; then
    echo "  WARNING: $path is an LFS pointer (not checked out); skipping." >&2
    continue
  fi
  printf '%s|%s|%s\n' "$key" "$oid" "$path" >> "$desired_keys"
done < <(git lfs ls-files -l 2>/dev/null || true)

# 2b. Fallback: any video/poster not picked up by LFS (e.g. files added but
#     not yet pointer-ified). Hash with sha256sum so we still have a fingerprint.
hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

add_if_missing() {
  local file="$1" key="$2"
  if ! grep -q "^${key}|" "$desired_keys"; then
    local oid
    oid=$(hash_file "$file")
    printf '%s|%s|%s\n' "$key" "$oid" "$file" >> "$desired_keys"
  fi
}

for file in "$VIDEO_DIR"/*.mp4 "$VIDEO_DIR"/*.webm; do
  [ -f "$file" ] || continue
  add_if_missing "$file" "$(basename "$file")"
done
if [ -d "$VIDEO_DIR/posters" ]; then
  for file in "$VIDEO_DIR/posters"/*.jpg; do
    [ -f "$file" ] || continue
    add_if_missing "$file" "posters/$(basename "$file")"
  done
fi

# 3. Diff against the manifest and upload changed/new files.
uploaded=0
skipped=0
manifest_changed=0

while IFS='|' read -r key oid file; do
  [ -z "$key" ] && continue
  current=$(jq -r --arg k "$key" '.[$k] // empty' "$new_manifest")
  if [ "$current" = "$oid" ]; then
    skipped=$((skipped + 1))
    continue
  fi

  case "$key" in
    *.mp4)  ct="video/mp4" ;;
    *.webm) ct="video/webm" ;;
    *.jpg)  ct="image/jpeg" ;;
    *)      ct="application/octet-stream" ;;
  esac

  echo "  Uploading $key ($ct)..."
  npx wrangler r2 object put "$BUCKET/$key" --file="$file" --content-type="$ct" --remote
  uploaded=$((uploaded + 1))

  jq --arg k "$key" --arg v "$oid" '.[$k] = $v' "$new_manifest" > "$new_manifest.tmp"
  mv "$new_manifest.tmp" "$new_manifest"
  manifest_changed=1
done < "$desired_keys"

# 4. Write the manifest back if anything changed.
if [ "$manifest_changed" -eq 1 ]; then
  echo "  Updating $MANIFEST_KEY in R2..."
  npx wrangler r2 object put "$BUCKET/$MANIFEST_KEY" \
    --file="$new_manifest" --content-type="application/json" --remote
fi

echo "R2 sync complete: $uploaded uploaded, $skipped unchanged."
