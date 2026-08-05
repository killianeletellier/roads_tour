#!/usr/bin/env bash
# Stop production stack and remove stale fixed-name containers.
#
# Usage:
#   ./scripts/cleanup-prod.sh              # stop stack, keep volumes (safe for DB)
#   ./scripts/cleanup-prod.sh --volumes    # also remove named volumes (WIPES DB/OSRM data)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=scripts/lib/prod-docker.sh
source "$ROOT_DIR/scripts/lib/prod-docker.sh"

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"

WITH_VOLUMES=false
if [ "${1:-}" = "--volumes" ]; then
  WITH_VOLUMES=true
elif [ -n "${1:-}" ]; then
  echo "Usage: $0 [--volumes]"
  exit 1
fi

if [ ! -f .env.prod ]; then
  echo "Warning: .env.prod not found; continuing with compose file defaults only."
fi

echo "==> Removing fixed-name containers (orphans from other Compose projects)"
remove_stale_prod_containers

if $WITH_VOLUMES; then
  echo "==> docker compose down --remove-orphans -v (PostgreSQL and OSRM volumes will be deleted)"
  $COMPOSE down --remove-orphans -v
else
  echo "==> docker compose down --remove-orphans (volumes preserved)"
  $COMPOSE down --remove-orphans
fi

echo ""
echo "Done. Redeploy with: ./scripts/deploy-prod.sh"
