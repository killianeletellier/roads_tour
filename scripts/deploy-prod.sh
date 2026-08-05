#!/usr/bin/env bash
# Production deployment helper for Roads Tour.
#
# Usage:
#   chmod +x scripts/deploy-prod.sh
#   ./scripts/deploy-prod.sh          # full stack
#   ./scripts/deploy-prod.sh app      # rebuild app only

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=scripts/lib/prod-docker.sh
source "$ROOT_DIR/scripts/lib/prod-docker.sh"

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"

if [ ! -f .env.prod ]; then
  echo "Error: .env.prod not found."
  echo "  cp .env.prod.example .env.prod"
  echo "  # edit passwords, JWT_SECRET, DOMAIN, CERTBOT_EMAIL"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env.prod
set +a

if [ "${ADMIN_PASSWORD:-}" = "change-me-admin-password" ] || [ "${JWT_SECRET:-}" = "change-me-jwt-secret-min-32-chars" ]; then
  echo "Warning: ADMIN_PASSWORD or JWT_SECRET still use placeholder values."
fi

SERVICE="${1:-}"

UP_FLAGS=(up -d --build --force-recreate --remove-orphans)

if [ -n "$SERVICE" ]; then
  CONTAINER_NAME="$(prod_container_name_for_service "$SERVICE" || true)"
  if [ -n "${CONTAINER_NAME:-}" ]; then
    remove_stale_prod_containers "$CONTAINER_NAME"
  fi
  echo "==> Building and starting: $SERVICE"
  $COMPOSE "${UP_FLAGS[@]}" "$SERVICE"
else
  echo "==> Stopping existing stack (volumes preserved — DB not wiped)"
  $COMPOSE down --remove-orphans
  remove_stale_prod_containers
  echo "==> Building and starting full production stack"
  $COMPOSE "${UP_FLAGS[@]}"
fi

echo ""
echo "Stack status:"
$COMPOSE ps

echo ""
echo "Health:"
echo "  curl -sf http://localhost/api/health   # before HTTPS"
echo "  curl -sf https://${DOMAIN:-your-domain}/api/health"
echo "  curl -sf https://${DOMAIN:-your-domain}/api/health/osrm"
echo ""
echo "OSRM diagnostics:"
echo "  ./scripts/download-osm.sh              # poitou-charentes (default) if volume empty"
echo "  ./docker/osrm/prepare.sh docker/osrm/data/region.osm.pbf --prod"
echo "  docker logs roads-tour-osrm --tail 50"
echo "  docker volume inspect roads-tour_osrm-data"
echo "  docker exec roads-tour-app node -e \"fetch('http://osrm:5000/nearest/v1/driving/0,0').then(r=>console.log(r.status)).catch(e=>console.error(e.message))\""
echo ""
echo "Container name conflicts: ./scripts/cleanup-prod.sh"
