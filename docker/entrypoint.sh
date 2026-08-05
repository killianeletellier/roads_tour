#!/bin/sh
set -e

log() {
  echo "[entrypoint $(date -Iseconds)] $*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

log "Starting Roads Tour app container"

if [ -z "${DATABASE_URL:-}" ]; then
  fail "DATABASE_URL is not set. Check .env.prod and docker-compose.prod.yml."
fi

DEFAULT_JWT="change-me-jwt-secret-min-32-chars"
DEFAULT_ADMIN="change-me-admin-password"

if [ "${NODE_ENV:-}" = "production" ]; then
  jwt_insecure=0
  admin_insecure=0

  if [ -z "${JWT_SECRET:-}" ] || [ "${JWT_SECRET}" = "$DEFAULT_JWT" ]; then
    jwt_insecure=1
  fi
  if [ -z "${ADMIN_PASSWORD:-}" ] || [ "${ADMIN_PASSWORD}" = "$DEFAULT_ADMIN" ]; then
    admin_insecure=1
  fi

  if [ "$jwt_insecure" = "1" ] || [ "$admin_insecure" = "1" ]; then
    if [ "${ALLOW_INSECURE_SECRETS:-}" = "1" ]; then
      log "WARNING: Using default JWT_SECRET and/or ADMIN_PASSWORD in production."
      log "WARNING: Set strong secrets in .env.prod and remove ALLOW_INSECURE_SECRETS=1."
      [ "$jwt_insecure" = "1" ] && log "WARNING: JWT_SECRET is missing or still the template value."
      [ "$admin_insecure" = "1" ] && log "WARNING: ADMIN_PASSWORD is missing or still the template value."
    else
      log "Production secrets are not configured."
      [ "$jwt_insecure" = "1" ] && log "  -> Set JWT_SECRET in .env.prod (not '$DEFAULT_JWT')."
      [ "$admin_insecure" = "1" ] && log "  -> Set ADMIN_PASSWORD in .env.prod (not '$DEFAULT_ADMIN')."
      log "To start anyway for debugging, set ALLOW_INSECURE_SECRETS=1 in .env.prod."
      exit 1
    fi
  fi
fi

log "Waiting for PostgreSQL at $(node -e "const u=new URL(process.env.DATABASE_URL); process.stdout.write(u.hostname+':'+(u.port||5432))")..."
attempt=0
max_attempts=60
until node -e "
const net = require('net');
const url = new URL(process.env.DATABASE_URL);
const port = Number(url.port || 5432);
const sock = net.createConnection({ host: url.hostname, port }, () => { sock.end(); process.exit(0); });
sock.on('error', (err) => { console.error('[entrypoint] Postgres TCP check failed:', err.message); process.exit(1); });
sock.setTimeout(5000, () => { console.error('[entrypoint] Postgres TCP check timed out'); sock.destroy(); process.exit(1); });
"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$max_attempts" ]; then
    fail "PostgreSQL not reachable after ${max_attempts} attempts (~$((max_attempts * 2))s). Check postgres container and DATABASE_URL."
  fi
  sleep 2
done
log "PostgreSQL is reachable"

log "Running Prisma migrations..."
cd /app/packages/server
if ! prisma migrate deploy; then
  fail "Prisma migrate deploy failed. Run: docker logs roads-tour-app — check DATABASE_URL and migration history."
fi
log "Migrations applied"

log "Starting Node server on ${HOST:-0.0.0.0}:${PORT:-3000}..."
exec node dist/index.js
