#!/usr/bin/env bash
# Deploys 0b2d784 (bug sweep: Paystack webhook, receipts, credit notes, rate limiting) — api + web.
# No new DB migrations (migrate deploy is a no-op safety step); backs up the poolcare DB first and stops before restarting
# anything if the migration fails. Website, postgres and other tenants untouched.
set -euo pipefail

TAG=0b2d78417a5d7e5df240bee21f649127a4461f85
VPS=root@168.231.80.10
DIR=/root/poolcare/deploy
COMPOSE="docker compose --env-file .env -f docker-compose.prod.yml"

echo "==> 1/6  pull api + web images ($TAG)"
ssh "$VPS" "cd $DIR && TAG=$TAG $COMPOSE pull api web"

echo
echo "==> 2/6  back up the poolcare database"
ssh "$VPS" "cd $DIR && $COMPOSE exec -T postgres pg_dump -U poolcare poolcare | gzip > /root/poolcare/backups/pre-sweep-\$(date +%F-%H%M).sql.gz && ls -lh /root/poolcare/backups | head -2 | tail -1"

echo
echo "==> 3/6  run migrations"
ssh "$VPS" "cd $DIR && TAG=$TAG $COMPOSE run --rm api prisma migrate deploy --schema prisma/schema.prisma"

echo
echo "==> 4/6  recreate api + web"
ssh "$VPS" "cd $DIR && TAG=$TAG $COMPOSE up -d api web"

echo
echo "==> 5/6  pin TAG in .env so a later restart doesn't roll back"
ssh "$VPS" "sed -i 's/^TAG=.*/TAG=$TAG/' $DIR/.env && grep -c '^TAG=$TAG' $DIR/.env"

echo
echo "==> 6/6  health check (waiting 30s for boot)"
sleep 30
curl -sS -o /dev/null -w "api health          -> %{http_code}  (want 200)\n" https://api.poolcare.africa/api/healthz
curl -sS -o /dev/null -w "credit notes (no auth) -> %{http_code}  (want 401)\n" https://api.poolcare.africa/api/invoices/credit-notes
curl -sS -o /dev/null -w "admin               -> %{http_code}\n" https://admin.poolcare.africa
