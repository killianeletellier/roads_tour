#!/bin/sh
set -e

DATA="${OSRM_GRAPH:-/data/region.osrm}"

if [ ! -f "$DATA" ]; then
  echo "FATAL: OSRM graph not found at ${DATA}"
  echo ""
  echo "The osrm-data volume is empty. Prepare routing data once:"
  echo "  mkdir -p docker/osrm/data"
  echo "  ./scripts/download-osm.sh poitou-charentes"
  echo "  # ou : wget -c -O docker/osrm/data/region.osm.pbf https://download.geofabrik.de/europe/france/poitou-charentes-latest.osm.pbf"
  echo "  ./docker/osrm/prepare.sh docker/osrm/data/region.osm.pbf --prod"
  echo ""
  echo "Contents of /data:"
  ls -la /data/ 2>/dev/null || echo "  (empty or unreadable)"
  exit 1
fi

echo "Starting osrm-routed with graph: ${DATA}"
exec osrm-routed --algorithm mld "$DATA"
