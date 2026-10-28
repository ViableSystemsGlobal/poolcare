#!/usr/bin/env bash
# Deploys fc61184 (carer sweep: wizard photo upload decoding fix) — api + web.
# No new DB migrations (migrate deploy is a no-op safety step); backs up the poolcare DB first and stops before restarting
# anything if the migration fails. Website, postgres and other tenants untouched.
set -euo pipefail

TAG=fc61184e7d2abeaba47763fd625ed010efb46698
VPS=root@168.231.80.10
DIR=/root/poolcare/deploy
COMPOSE="docker compose --env-file .env -f docker-compose.prod.yml"

echo "==> 1/6  pull api + web images ($TAG)"
ssh "$VPS" "cd $DIR && TAG=$TAG $COMPOSE pull api web"

echo
echo "==> 2/6  back up the poolcare database"
ssh "$VPS" "cd $DIR && $COMPOSE exec -T postgres pg_dump -U poolcare poolcare | gzip > /root/poolcare/backups/pre-carer-fix-\$(date +%F-%H%M).sql.gz && ls -lht /root/poolcare/backups | sed -n 2p"

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
curl -sS -o /dev/null -w "visits (no auth)      -> %{http_code}  (want 401)\n" https://api.poolcare.africa/api/visits
curl -sS -o /dev/null -w "admin               -> %{http_code}\n" https://admin.poolcare.africa
