#!/usr/bin/env bash
# Obtain initial Let's Encrypt certificate and reload nginx with HTTPS.
#
# Prerequisites:
#   - .env.prod configured (DOMAIN, CERTBOT_EMAIL)
#   - DNS A/AAAA record for DOMAIN pointing to this server
#   - Ports 80 and 443 open
#
# Usage:
#   chmod +x scripts/init-letsencrypt.sh
#   ./scripts/init-letsencrypt.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"

if [ ! -f .env.prod ]; then
  echo "Error: .env.prod not found. Copy from .env.prod.example first."
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env.prod
set +a

if [ -z "${DOMAIN:-}" ] || [ "$DOMAIN" = "roadstour.example.com" ]; then
  echo "Error: set DOMAIN in .env.prod to your real domain."
  exit 1
fi

if [ -z "${CERTBOT_EMAIL:-}" ]; then
  echo "Error: set CERTBOT_EMAIL in .env.prod."
  exit 1
fi

STAGING_ARG=""
if [ "${CERTBOT_STAGING:-0}" = "1" ]; then
  STAGING_ARG="--staging"
  echo "Using Let's Encrypt STAGING environment"
fi

if $COMPOSE run --rm --entrypoint sh certbot -c "test -f /etc/letsencrypt/live/${DOMAIN}/fullchain.pem" 2>/dev/null; then
  echo "Certificate already exists for ${DOMAIN}, reloading nginx..."
  $COMPOSE up -d --force-recreate nginx certbot
  exit 0
fi

echo "==> Starting postgres + osrm + app (required for nginx healthcheck)..."
$COMPOSE up -d postgres osrm app

echo "==> Starting nginx (HTTP bootstrap until cert exists)..."
$COMPOSE up -d nginx

echo "==> Requesting certificate for ${DOMAIN}..."
$COMPOSE run --rm --entrypoint certbot certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$CERTBOT_EMAIL" \
  --agree-tos \
  --no-eff-email \
  $STAGING_ARG \
  -d "$DOMAIN"

echo "==> Reloading nginx with HTTPS config..."
$COMPOSE up -d --force-recreate nginx certbot

echo "==> Done. Verify: https://${DOMAIN}/api/health"
