#!/usr/bin/env bash
# Nightly Postgres backup for the poolcare tenant. Dumps the live DB to a
# gzipped, timestamped file and prunes anything older than RETENTION_DAYS.
#
# Installed at /root/poolcare-backup.sh, run by cron at 03:45 (the shared
# /root/backup-all.sh runs at 03:30 for the other tenants — staggered so two
# pg_dumps never overlap on this 8 GB shared box).
#
# Local dumps only: /root/backup-offsite.sh pushes just tailoredhands + docm,
# so poolcare dumps are NOT yet replicated off-box.
set -euo pipefail

BK=/root/poolcare/backups
RETENTION_DAYS=14
DOCKER=/usr/bin/docker
ts=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BK"
"$DOCKER" exec poolcare-postgres-1 pg_dump -U poolcare -d poolcare --no-owner --no-acl \
  | gzip > "$BK/poolcare-$ts.sql.gz"

# Fail loudly if the dump is suspiciously small (<1 KB => likely an error).
size=$(stat -c%s "$BK/poolcare-$ts.sql.gz")
if [ "$size" -lt 1024 ]; then
  echo "ERROR: backup poolcare-$ts.sql.gz is only ${size}B — check the DB." >&2
  exit 1
fi

find "$BK" -name 'poolcare-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
echo "$(date -Is) backup ok: poolcare-$ts.sql.gz (${size} bytes)"
