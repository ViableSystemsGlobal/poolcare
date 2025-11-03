#!/usr/bin/env bash
set -e

SHA=$1
ENV=${2:-prod}
APP=api
BASE=/srv/poolcare/$APP
NEW=$BASE/releases/$SHA
ENVFILE=/srv/poolcare/shared/.env.$ENV

if [ ! -d "$NEW" ]; then
    echo "Error: Release directory $NEW does not exist"
    exit 1
fi

echo "Activating API release $SHA for environment $ENV"

# Install deps if needed
cd $NEW && npm ci --omit=dev

# Run migrations
cd $NEW && npx prisma migrate deploy

# Start parallel instance on :4001
echo "Starting api-next on port 4001..."
pm2 startOrReload /srv/poolcare/shared/pm2.config.cjs --only api-next --update-env -- \
    PORT=4001 ENV_FILE=$ENVFILE

# Wait a moment for startup
sleep 3

# Health check
if ! curl -fsS http://127.0.0.1:4001/api/healthz > /dev/null; then
    echo "Error: Health check failed for api-next"
    pm2 delete api-next || true
    exit 1
fi

echo "Health check passed"

# Swap Nginx upstream (if using separate upstream file)
if [ -f "/srv/poolcare/shared/nginx/api-upstream.4001.conf" ]; then
    sudo ln -sf /srv/poolcare/shared/nginx/api-upstream.4001.conf /etc/nginx/conf.d/api-upstream.conf
    sudo nginx -t && sudo systemctl reload nginx
fi

# Stop old instance and start current on :4000
echo "Stopping old instance and starting current on port 4000..."
pm2 delete api-current || true
pm2 start /srv/poolcare/shared/pm2.config.cjs --only api-current --update-env -- \
    PORT=4000 ENV_FILE=$ENVFILE

# Clean up next instance (will be used for next deployment)
pm2 delete api-next || true

echo "Deployment complete"

