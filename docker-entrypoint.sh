#!/bin/sh
set -e

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
node node_modules/prisma/build/index.js migrate deploy

echo "Starting server..."
exec node server.js
