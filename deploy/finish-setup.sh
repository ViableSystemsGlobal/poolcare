#!/usr/bin/env bash
# poolcare — one-shot finisher for the steps that need human sign-off:
#   1. Prisma baseline of the fresh DB (db push + mark 30 migrations applied)
#   2. Import website data (Organization/User/OrgMember/WebsiteContent/BlogTopic/BlogPost)
#   3. Enable the poolcare bootstrap vhost (HTTP/ACME only) + nginx reload
# Touches ONLY poolcare resources; nginx reload is gated by nginx -t.
set -euo pipefail
cd /root/poolcare/deploy

echo "== 1/3 Prisma baseline =="
docker compose --env-file .env -f docker-compose.prod.yml run --rm --no-deps api sh -c '
  prisma db push --skip-generate --accept-data-loss --schema /app/prisma/schema.prisma &&
  ls /app/prisma/migrations | grep -v migration_lock | while read m; do
    prisma migrate resolve --applied "$m" --schema /app/prisma/schema.prisma >/dev/null 2>&1 || true
  done &&
  prisma migrate deploy --schema /app/prisma/schema.prisma'

echo "== 2/3 Import website data =="
docker exec -i poolcare-postgres-1 psql -U poolcare -d poolcare -v ON_ERROR_STOP=1 -q \
  < /root/poolcare/deploy/website-data.sql
docker exec poolcare-postgres-1 psql -U poolcare -d poolcare -c \
  "select 'WebsiteContent' t, count(*) from \"WebsiteContent\"
   union all select 'BlogPost', count(*) from \"BlogPost\"
   union all select 'BlogTopic', count(*) from \"BlogTopic\"
   union all select 'User', count(*) from \"User\"
   union all select 'OrgMember', count(*) from \"OrgMember\""

echo "== 3/3 nginx bootstrap vhost =="
ln -sf /etc/nginx/sites-available/poolcare-bootstrap.conf /etc/nginx/sites-enabled/poolcare-bootstrap.conf
nginx -t
systemctl reload nginx

echo "== restarting api/web =="
docker compose --env-file .env -f docker-compose.prod.yml restart api web
sleep 6
echo "== local health checks =="
curl -sf -o /dev/null -w "api /api/health -> %{http_code}\n" http://127.0.0.1:4120/api/health || true
curl -sf -o /dev/null -w "web / -> %{http_code}\n" http://127.0.0.1:3110/ || true
echo "ALL DONE"
