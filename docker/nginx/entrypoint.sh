#!/bin/sh
set -e

DOMAIN="${DOMAIN:-localhost}"
export DOMAIN

CONF_DIR="/etc/nginx/conf.d"
mkdir -p "$CONF_DIR"
rm -f "${CONF_DIR}/default.conf"

if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  echo "SSL certificate found for ${DOMAIN}, enabling HTTPS"
  envsubst '${DOMAIN}' < /etc/nginx/templates/default.conf.template > "${CONF_DIR}/default.conf"
else
  echo "No SSL certificate for ${DOMAIN}, serving HTTP only (run scripts/init-letsencrypt.sh)"
  envsubst '${DOMAIN}' < /etc/nginx/templates/default-http.conf > "${CONF_DIR}/default.conf"
fi

exec nginx -g 'daemon off;'
