#!/bin/sh
set -e

./node_modules/.bin/prisma migrate deploy

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec node dist/src/index.js
