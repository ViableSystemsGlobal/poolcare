#!/bin/bash

# Quick API health check script
# Use this to verify the API server is running and healthy

API_URL="http://localhost:4000/api/healthz"

echo "🔍 Checking API server health..."
echo ""

# Check if port 4000 is open
if ! lsof -i :4000 >/dev/null 2>&1; then
    echo "❌ No process listening on port 4000"
    echo ""
    echo "To start the API server, run:"
    echo "  ./start-api.sh"
    echo ""
    echo "  OR"
    echo ""
    echo "  cd apps/api && pnpm dev"
    exit 1
fi

# Check if API responds
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL" 2>/dev/null)

if [ "$RESPONSE" = "200" ]; then
    HEALTH_DATA=$(curl -s "$API_URL")
    echo "✅ API server is healthy!"
    echo ""
    echo "Response: $HEALTH_DATA"
    echo ""
    echo "API is available at: http://localhost:4000/api"
    exit 0
else
    echo "⚠️  Port 4000 is in use but API is not responding correctly"
    echo "HTTP Status: $RESPONSE"
    echo ""
    echo "Try restarting the API server:"
    echo "  ./start-api.sh"
    exit 1
fi

