#!/usr/bin/env bash
# Prepare OSRM routing data from an OSM extract and load into the production volume.
#
# Usage:
#   ./docker/osrm/prepare.sh [path/to/region.osm.pbf] [--prod]
#
# Example (Poitou-Charentes — default region for Roads Tour):
#   mkdir -p docker/osrm/data
#   ./scripts/download-osm.sh poitou-charentes
#   ./docker/osrm/prepare.sh docker/osrm/data/region.osm.pbf --prod
#
# Example (Monaco — small, good for quick tests):
#   ./scripts/download-osm.sh monaco
#   ./docker/osrm/prepare.sh docker/osrm/data/region.osm.pbf --prod

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/data"
INPUT=""
COPY_TO_PROD=0

# Minimum size for a valid extract (Poitou-Charentes ~220 MiB; HTML error pages are usually < 50 KiB).
MIN_PBF_BYTES=102400

for arg in "$@"; do
  case "$arg" in
    --prod) COPY_TO_PROD=1 ;;
    *) INPUT="$arg" ;;
  esac
done

INPUT="${INPUT:-${DATA_DIR}/region.osm.pbf}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Match Docker Compose project name (see `name:` in docker-compose.prod.yml)
COMPOSE_NAME="$(grep -E '^name:' "${ROOT_DIR}/${COMPOSE_FILE}" 2>/dev/null | awk '{print $2}' | tr -d '"' || true)"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-${COMPOSE_NAME:-roads-tour}}"
VOLUME_NAME="${OSRM_VOLUME:-${PROJECT_NAME}_osrm-data}"

file_size_bytes() {
  local f="$1"
  if stat -f%z "$f" >/dev/null 2>&1; then
    stat -f%z "$f"
  else
    stat -c%s "$f"
  fi
}

print_pbf_fix_instructions() {
  local file="$1"
  cat <<EOF

Comment corriger / How to fix:
  1. Supprimer le fichier corrompu :
       rm -f "$file"
  2. Re-télécharger avec reprise (wget -c) :
       mkdir -p docker/osrm/data
       wget -c -O docker/osrm/data/region.osm.pbf URL_GEofabrik
     Ou utiliser le helper :
       ./scripts/download-osm.sh poitou-charentes
       ./scripts/download-osm.sh monaco
  3. Vérifier le fichier avant prepare.sh :
       ls -lh docker/osrm/data/region.osm.pbf
       head -c 20 docker/osrm/data/region.osm.pbf | xxd
     Attendu : premier octet 0a (protobuf), PAS de texte HTML (<!DOCTYPE, <html).
  4. Relancer :
       ./docker/osrm/prepare.sh docker/osrm/data/region.osm.pbf --prod

Extracts Geofabrik : https://download.geofabrik.de/
EOF
}

validate_osm_pbf() {
  local file="$1"

  if [ ! -f "$file" ]; then
    echo "Erreur / Error: fichier OSM introuvable / OSM file not found: $file"
    echo "Téléchargez un extract sur https://download.geofabrik.de/ ou ./scripts/download-osm.sh poitou-charentes"
    exit 1
  fi

  local size
  size="$(file_size_bytes "$file")"

  if [ "$size" -lt "$MIN_PBF_BYTES" ]; then
    echo "Erreur / Error: fichier trop petit (${size} octets) — probablement vide ou tronqué."
    echo "Error: file too small (${size} bytes) — likely empty or truncated download."
    print_pbf_fix_instructions "$file"
    exit 1
  fi

  local header
  header="$(head -c 512 "$file" || true)"

  if printf '%s' "$header" | grep -qiE '^[[:space:]]*<!DOCTYPE|^[[:space:]]*<html'; then
    echo "Erreur / Error: le fichier ressemble à une page HTML, pas à un PBF OSM."
    echo "Error: file looks like an HTML error page (download failed — 404, redirect, etc.)."
    echo ""
    echo "Aperçu du début du fichier / File preview:"
    head -c 200 "$file" | tr '\n' ' '
    echo ""
    print_pbf_fix_instructions "$file"
    exit 1
  fi

  local first_byte
  first_byte="$(head -c 1 "$file" | od -An -tx1 | tr -d ' \n')"
  if [ "$first_byte" != "0a" ]; then
    echo "Erreur / Error: en-tête PBF OSM invalide (premier octet: 0x${first_byte}, attendu: 0x0a)."
    echo "Error: invalid OSM PBF header (first byte: 0x${first_byte}, expected: 0x0a protobuf BlobHeader)."
    if command -v file >/dev/null 2>&1; then
      echo "  file: $(file -b "$file")"
    fi
    echo ""
    echo "Causes fréquentes / Common causes:"
    echo "  - Téléchargement interrompu ou URL incorrecte"
    echo "  - Fichier XML (.osm) au lieu de binaire (.osm.pbf)"
    echo "  - Page d'erreur du serveur enregistrée à la place du PBF"
    print_pbf_fix_instructions "$file"
    exit 1
  fi

  if [ "$size" -lt 1048576 ]; then
    echo "Note: fichier petit ($(numfmt --to=iec-i --suffix=B "$size" 2>/dev/null || echo "${size} B")) — OK pour un petit extract de test (ex. monaco), insuffisant pour Poitou-Charentes ou une grande région."
  fi

  echo "==> Validation PBF OK ($(numfmt --to=iec-i --suffix=B "$size" 2>/dev/null || echo "${size} octets")): $file"
}

validate_osm_pbf "$INPUT"

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
