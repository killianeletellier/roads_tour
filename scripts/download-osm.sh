#!/usr/bin/env bash
# Download an OSM PBF extract from Geofabrik into docker/osrm/data/region.osm.pbf
#
# Usage:
#   ./scripts/download-osm.sh [region] [output_path]
#   ./scripts/download-osm.sh --list
#
# Examples:
#   ./scripts/download-osm.sh                          # default: poitou-charentes
#   ./scripts/download-osm.sh poitou-charentes
#   ./scripts/download-osm.sh monaco docker/osrm/data/region.osm.pbf

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_OUTPUT="${ROOT_DIR}/docker/osrm/data/region.osm.pbf"

declare -A REGIONS=(
  [poitou-charentes]="https://download.geofabrik.de/europe/france/poitou-charentes-latest.osm.pbf"
  [monaco]="https://download.geofabrik.de/europe/monaco-latest.osm.pbf"
  [france]="https://download.geofabrik.de/europe/france-latest.osm.pbf"
  [belgium]="https://download.geofabrik.de/europe/belgium-latest.osm.pbf"
  [germany]="https://download.geofabrik.de/europe/germany-latest.osm.pbf"
  [switzerland]="https://download.geofabrik.de/europe/switzerland-latest.osm.pbf"
  [italy]="https://download.geofabrik.de/europe/italy-latest.osm.pbf"
  [spain]="https://download.geofabrik.de/europe/spain-latest.osm.pbf"
  [great-britain]="https://download.geofabrik.de/europe/great-britain-latest.osm.pbf"
  [netherlands]="https://download.geofabrik.de/europe/netherlands-latest.osm.pbf"
  [portugal]="https://download.geofabrik.de/europe/portugal-latest.osm.pbf"
)

list_regions() {
  echo "Régions disponibles / Available regions:"
  for name in $(printf '%s\n' "${!REGIONS[@]}" | sort); do
    printf '  %-16s %s\n' "$name" "${REGIONS[$name]}"
  done
  echo ""
  echo "Usage: ./scripts/download-osm.sh <region> [output_path]"
  echo "Index complet : https://download.geofabrik.de/"
}

if [ "${1:-}" = "--list" ] || [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  list_regions
  exit 0
fi

REGION="${1:-poitou-charentes}"
OUTPUT="${2:-$DEFAULT_OUTPUT}"

if [ -z "${REGIONS[$REGION]+x}" ]; then
  echo "Erreur / Error: région inconnue / unknown region: $REGION"
  echo ""
  list_regions
  exit 1
fi

URL="${REGIONS[$REGION]}"
mkdir -p "$(dirname "$OUTPUT")"

echo "==> Téléchargement / Download: $REGION"
echo "    URL    : $URL"
echo "    Output : $OUTPUT"
echo ""

if command -v wget >/dev/null 2>&1; then
  wget -c --progress=bar:force -O "$OUTPUT" "$URL"
elif command -v curl >/dev/null 2>&1; then
  curl -fL -C - -o "$OUTPUT" "$URL"
else
  echo "Erreur / Error: wget ou curl requis / required."
  exit 1
fi

echo ""
echo "==> Vérification / Verification:"
ls -lh "$OUTPUT"
echo ""
echo "En-tête binaire (doit commencer par 0a, pas HTML) / Binary header (expect 0a, not HTML):"
head -c 20 "$OUTPUT" | xxd

first_byte="$(head -c 1 "$OUTPUT" | od -An -tx1 | tr -d ' \n')"
if [ "$first_byte" != "0a" ]; then
  echo ""
  echo "Attention / Warning: en-tête PBF suspect (0x${first_byte}). Le fichier est peut-être corrompu."
  echo "Relancez avec wget -c ou supprimez le fichier et réessayez."
  exit 1
fi

echo ""
echo "==> OK. Prochaine étape / Next step:"
echo "    ./docker/osrm/prepare.sh $OUTPUT --prod"
