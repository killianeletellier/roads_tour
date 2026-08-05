#!/usr/bin/env bash
# Shared helpers for production Docker Compose (fixed container_name in compose file).

PROD_CONTAINER_NAMES=(
  roads-tour-postgres
  roads-tour-osrm
  roads-tour-app
  roads-tour-nginx
  roads-tour-certbot
)

prod_container_name_for_service() {
  case "$1" in
    postgres) echo roads-tour-postgres ;;
    osrm) echo roads-tour-osrm ;;
    app) echo roads-tour-app ;;
    nginx) echo roads-tour-nginx ;;
    certbot) echo roads-tour-certbot ;;
    *) return 1 ;;
  esac
}

# Remove fixed-name containers left from another Compose project or manual runs.
remove_stale_prod_containers() {
  local names=("$@")
  local name

  if [ "${#names[@]}" -eq 0 ]; then
    names=("${PROD_CONTAINER_NAMES[@]}")
  fi

  for name in "${names[@]}"; do
    if docker container inspect "$name" >/dev/null 2>&1; then
      echo "==> Removing stale container: $name"
      docker rm -f "$name" >/dev/null
    fi
  done
}
