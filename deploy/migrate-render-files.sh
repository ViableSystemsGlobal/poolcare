#!/usr/bin/env bash
# Copy the branding images referenced by the Render OrgSetting profile onto this
# VPS, into the api container's uploads volume, preserving scope/filename so the
# existing /api/files/local/<scope>/<file> route serves them unchanged.
#
# Render must still be reachable (its file endpoint answers even in maintenance mode).
# Safe to re-run: files already present are skipped.
set -uo pipefail

RENDER_BASE=https://poolcare-ef74.onrender.com/api/files/local
SRC_DB=scratch_render
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# every https://…/api/files/local/<scope>/<file> URL in the profile JSON
mapfile -t URLS < <(docker exec poolcare-postgres-1 psql -U poolcare -d "$SRC_DB" -t -A -c \
  "select distinct v from \"OrgSetting\", lateral jsonb_each_text(profile::jsonb) as e(k, v)
   where v like '%/api/files/local/%'")

echo "found ${#URLS[@]} branding images referenced by settings"
ok=0; fail=0

for url in "${URLS[@]}"; do
  rel="${url#*/api/files/local/}"          # <scope>/<filename>
  scope="${rel%%/*}"; file="${rel##*/}"
  if docker exec poolcare-api-1 test -f "/data/uploads/$scope/$file" 2>/dev/null; then
    echo "  = already present: $scope/$file"; ok=$((ok+1)); continue
  fi
  code=$(curl -s -o "$TMP/$file" -w '%{http_code}' --max-time 60 "$RENDER_BASE/$rel")
  if [ "$code" != "200" ] || [ ! -s "$TMP/$file" ]; then
    echo "  ! FAILED ($code): $scope/$file"; fail=$((fail+1)); continue
  fi
  docker exec poolcare-api-1 mkdir -p "/data/uploads/$scope"
  docker cp "$TMP/$file" "poolcare-api-1:/data/uploads/$scope/$file" >/dev/null
  echo "  + $scope/$file ($(stat -c%s "$TMP/$file") bytes)"
  ok=$((ok+1))
done

echo "done: $ok ok, $fail failed"
docker exec poolcare-api-1 sh -c 'echo "uploads now: $(find /data/uploads -type f | wc -l) files"'
