#!/bin/bash

# PoolCare API Startup Script
# Run this script to start the API server on port 4000

set -e

echo "🚀 Starting PoolCare API Server..."
echo ""

# Kill any existing processes on port 4000
if lsof -ti :4000 >/dev/null 2>&1; then
    echo "⚠️  Port 4000 is in use. Killing existing process..."
    lsof -ti :4000 | xargs kill -9 2>/dev/null || true
    sleep 2
fi

# Change to API directory
cd "$(dirname "$0")/apps/api"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found at apps/api/.env"
    echo "Please create it with your DATABASE_URL and JWT_SECRET"
    exit 1
fi

# Start the server
echo "Starting server on port 4000..."
PORT=4000 pnpm dev


