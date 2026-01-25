#!/bin/bash

echo "🔄 Restarting API Server..."
echo ""

# Kill anything on port 4000
echo "1. Killing existing processes..."
lsof -ti:4000 | xargs kill -9 2>/dev/null || echo "   No process found on port 4000"
sleep 1

# Go to API directory
cd "$(dirname "$0")/apps/api"

# Check .env
if [ ! -f ".env" ]; then
    echo "❌ ERROR: .env file not found at apps/api/.env"
    exit 1
fi

# Start server
echo "2. Starting API server on port 4000..."
echo ""
PORT=4000 pnpm dev

