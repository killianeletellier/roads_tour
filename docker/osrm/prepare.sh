#!/usr/bin/env bash
# Prepare OSRM routing data from an OSM extract and load into the production volume.
#
# Usage:
#   ./docker/osrm/prepare.sh [path/to/region.osm.pbf] [--prod]
#
# Example (Monaco — small, good for testing):
#   mkdir -p docker/osrm/data
#   wget -O docker/osrm/data/region.osm.pbf https://download.geofabrik.de/europe/monaco-latest.osm.pbf
#   ./docker/osrm/prepare.sh docker/osrm/data/region.osm.pbf --prod
#
# Example (France — large, ~4 GB download + long processing):
#   wget -O docker/osrm/data/region.osm.pbf https://download.geofabrik.de/europe/france-latest.osm.pbf
#   ./docker/osrm/prepare.sh docker/osrm/data/region.osm.pbf --prod

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/data"
INPUT=""
COPY_TO_PROD=0

for arg in "$@"; do
  case "$arg" in
    --prod) COPY_TO_PROD=1 ;;
    *) INPUT="$arg" ;;
  esac
done

INPUT="${INPUT:-${DATA_DIR}/region.osm.pbf}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-roads-tour}"
VOLUME_NAME="${OSRM_VOLUME:-${PROJECT_NAME}_osrm-data}"

if [ ! -f "$INPUT" ]; then
  echo "Error: OSM file not found: $INPUT"
  echo "Download an extract from https://download.geofabrik.de/ and retry."
  exit 1
fi

mkdir -p "$DATA_DIR"

BASENAME="$(basename "$INPUT" .osm.pbf)"
INPUT_BASENAME="$(basename "$INPUT")"

echo "==> [1/3] Extracting OSRM graph from $INPUT"
docker run --rm -t \
  -v "${DATA_DIR}:/data" \
  osrm/osrm-backend \
  osrm-extract -p /opt/car.lua "/data/${INPUT_BASENAME}"

echo "==> [2/3] Partitioning"
docker run --rm -t \
  -v "${DATA_DIR}:/data" \
  osrm/osrm-backend \
  osrm-partition "/data/${BASENAME}.osrm"

echo "==> [3/3] Customizing (MLD)"
docker run --rm -t \
  -v "${DATA_DIR}:/data" \
  osrm/osrm-backend \
  osrm-customize "/data/${BASENAME}.osrm"

# Rename to region.osrm for docker-compose command
if [ "$BASENAME" != "region" ]; then
  echo "==> Renaming ${BASENAME}.* -> region.*"
  for f in "${DATA_DIR}/${BASENAME}".*; do
    [ -e "$f" ] || continue
    ext="${f#${DATA_DIR}/${BASENAME}.}"
    mv "$f" "${DATA_DIR}/region.${ext}"
  done
fi

echo "==> Done. OSRM files in ${DATA_DIR}/"

if [ "$COPY_TO_PROD" -eq 1 ]; then
  echo "==> Copying to production Docker volume: ${VOLUME_NAME}"
  docker volume create "${VOLUME_NAME}" >/dev/null
  docker run --rm \
    -v "${VOLUME_NAME}:/dest" \
    -v "${DATA_DIR}:/src:ro" \
    alpine:3.20 \
    sh -c 'cp -v /src/region.* /dest/'
  echo "==> Volume ready. Restart OSRM: docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} up -d osrm"
else
  echo ""
  echo "Dev:  docker compose --profile osrm up osrm -d"
  echo "Prod: ./docker/osrm/prepare.sh ${INPUT} --prod"
  echo "  or: docker volume create ${VOLUME_NAME} && docker run --rm -v ${VOLUME_NAME}:/dest -v ${DATA_DIR}:/src:ro alpine:3.20 sh -c 'cp /src/region.* /dest/'"
fi
