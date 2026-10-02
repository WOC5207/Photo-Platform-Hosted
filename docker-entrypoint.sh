#!/bin/sh
set -e

# The server never runs as root: sharp/libvips decodes untrusted uploads, and a
# decoder bug should not hand out root inside the container. Started as root
# (the default), fix ownership of the photos volume once — volumes created by
# older images are root-owned — then re-exec this script as `node`.
if [ "$(id -u)" = "0" ]; then
  photos_dir="${PHOTOS_DIR:-/data/photos}"
  mkdir -p "$photos_dir"
  if [ "$(stat -c %u "$photos_dir")" != "1000" ]; then
    echo "Giving the node user (uid 1000) ownership of $photos_dir..."
    chown -R node:node "$photos_dir"
  fi
  exec su-exec node "$0" "$@"
fi

case "${SESSION_SECRET:-}" in
  ""|change-me*)
    echo "SESSION_SECRET must be replaced with at least 32 random characters." >&2
    exit 1
    ;;
esac
if [ "${#SESSION_SECRET}" -lt 32 ]; then
  echo "SESSION_SECRET must contain at least 32 characters." >&2
  exit 1
fi

case "${ADMIN_PASSWORD:-}" in
  change-me*)
    echo "ADMIN_PASSWORD still contains the public example placeholder." >&2
    exit 1
    ;;
esac

echo "Applying database migrations..."
node migration/node_modules/prisma/build/index.js migrate deploy

echo "Starting server..."
exec node server.js
