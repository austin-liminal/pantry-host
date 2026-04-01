#!/bin/bash
# Syncs video and poster files from public/videos/ to the R2 bucket.
# Run from the repo root during CI build.
# Uploads are idempotent — re-uploading an unchanged file overwrites in R2.

set -e

BUCKET="pantry-host-videos"
VIDEO_DIR="packages/marketing/public/videos"

if [ ! -d "$VIDEO_DIR" ]; then
  echo "No videos directory found at $VIDEO_DIR — skipping R2 sync."
  exit 0
fi

count=0

# Upload videos
for file in "$VIDEO_DIR"/*.mp4 "$VIDEO_DIR"/*.webm; do
  [ -f "$file" ] || continue
  key=$(basename "$file")

  case "$key" in
    *.mp4)  ct="video/mp4" ;;
    *.webm) ct="video/webm" ;;
    *)      ct="application/octet-stream" ;;
  esac

  echo "  Uploading $key ($ct)..."
  npx wrangler r2 object put "$BUCKET/$key" --file="$file" --content-type="$ct" --remote
  count=$((count + 1))
done

# Upload poster images
if [ -d "$VIDEO_DIR/posters" ]; then
  for file in "$VIDEO_DIR/posters"/*.jpg; do
    [ -f "$file" ] || continue
    key="posters/$(basename "$file")"

    echo "  Uploading $key (image/jpeg)..."
    npx wrangler r2 object put "$BUCKET/$key" --file="$file" --content-type="image/jpeg" --remote
    count=$((count + 1))
  done
fi

echo "R2 sync complete: $count files uploaded."
