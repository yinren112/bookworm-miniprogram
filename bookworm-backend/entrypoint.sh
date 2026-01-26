#!/bin/sh
set -e

./node_modules/.bin/prisma migrate deploy

if [ "${ENSURE_LEGAL_CONTENT:-1}" != "0" ]; then
  if [ "$NODE_ENV" = "production" ] || [ "$NODE_ENV" = "staging" ]; then
    echo "[entrypoint] ensure legal content"
    node scripts/ensure_legal_content.mjs
  fi
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec node dist/src/index.js
