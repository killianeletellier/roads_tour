#!/bin/sh
set -e

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi

if [ "${NODE_ENV:-}" = "production" ]; then
  if [ -z "${JWT_SECRET:-}" ] || [ "${JWT_SECRET}" = "change-me-jwt-secret-min-32-chars" ]; then
    echo "ERROR: Set a strong JWT_SECRET in .env.prod"
    exit 1
  fi
  if [ -z "${ADMIN_PASSWORD:-}" ] || [ "${ADMIN_PASSWORD}" = "change-me-admin-password" ]; then
    echo "ERROR: Set a strong ADMIN_PASSWORD in .env.prod"
    exit 1
  fi
fi

echo "Waiting for PostgreSQL..."
until node -e "
const net = require('net');
const url = new URL(process.env.DATABASE_URL);
const port = url.port || 5432;
const sock = net.createConnection({ host: url.hostname, port }, () => { sock.end(); process.exit(0); });
sock.on('error', () => process.exit(1));
" 2>/dev/null; do
  sleep 2
done

echo "Running migrations..."
cd /app/packages/server
prisma migrate deploy

echo "Starting server..."
exec node dist/index.js
