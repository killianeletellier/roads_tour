#!/usr/bin/env bash
# Portable hex dump of the first N bytes of a file (no xxd required).

hex_dump_first_bytes() {
  local file="$1"
  local count="${2:-20}"

  if command -v xxd >/dev/null 2>&1; then
    head -c "$count" "$file" | xxd
  elif command -v hexdump >/dev/null 2>&1; then
    hexdump -C -n "$count" "$file" | head -1
  elif command -v od >/dev/null 2>&1; then
    od -An -tx1 -N "$count" "$file"
  else
    {
      local i=0 byte
      while [ "$i" -lt "$count" ] && IFS= read -r -n1 byte <&3; do
        printf '%02x ' "$(printf '%d' "'$byte")"
        i=$((i + 1))
      done
      printf '\n'
    } 3< "$file"
  fi
}

# Single byte at offset (0-based) as lowercase hex (e.g. 0a).
pbf_byte_at_offset() {
  local file="$1"
  local offset="$2"

  if command -v od >/dev/null 2>&1; then
    head -c $((offset + 1)) "$file" | tail -c 1 | od -An -tx1 | tr -d ' \n'
  else
    {
      local i=0 byte
      while [ "$i" -le "$offset" ] && IFS= read -r -n1 byte <&3; do
        if [ "$i" -eq "$offset" ]; then
          printf '%02x' "$(printf '%d' "'$byte")"
        fi
        i=$((i + 1))
      done
    } 3< "$file"
  fi
}

# Validate OSM PBF header (returns 0 if valid, 1 otherwise).
# Sets PBF_VALIDATE_MSG on success (detail for user-facing output).
# Sets PBF_VALIDATE_ERR on failure.
#
# Valid PBF layout: 4-byte big-endian length prefix, then protobuf BlobHeader
# (tag 0x0a). The string "OSMHeader" appears in the first blob of valid files.
pbf_validate_osm() {
  local file="$1"
  local header

  PBF_VALIDATE_MSG=""
  PBF_VALIDATE_ERR=""

  header="$(head -c 64 "$file" 2>/dev/null || true)"

  if [ -z "$header" ]; then
    PBF_VALIDATE_ERR="fichier vide ou illisible / empty or unreadable file"
    return 1
  fi

  if printf '%s' "$header" | grep -qiE '<!DOCTYPE|<html|<\?xml'; then
    PBF_VALIDATE_ERR="page HTML/XML détectée (téléchargement échoué?) / HTML/XML page detected (download failed?)"
    return 1
  fi

  if printf '%s' "$header" | grep -q 'OSMHeader'; then
    PBF_VALIDATE_MSG="OSMHeader détecté"
    return 0
  fi

  local blob_tag
  blob_tag="$(pbf_byte_at_offset "$file" 4)"
  if [ "$blob_tag" = "0a" ]; then
    PBF_VALIDATE_MSG="BlobHeader protobuf détecté (offset 4: 0x0a)"
    return 0
  fi

  PBF_VALIDATE_ERR="signature PBF OSM introuvable (pas de OSMHeader ni 0x0a à l'offset 4) / OSM PBF signature not found"
  return 1
}
