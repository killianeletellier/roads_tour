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

# First byte as lowercase hex (e.g. 0a), for PBF magic check.
pbf_first_byte_hex() {
  local file="$1"
  if command -v od >/dev/null 2>&1; then
    head -c 1 "$file" | od -An -tx1 | tr -d ' \n'
  else
    {
      local byte
      IFS= read -r -n1 byte <&3 || true
      printf '%02x' "$(printf '%d' "'$byte")"
    } 3< "$file"
  fi
}
