#!/bin/bash

# PoolCare Auto-Start Script
# Starts both API server and web frontend

set -e

echo "🚀 Starting PoolCare (API + Web Frontend)..."
echo ""

# Kill any existing processes on port 4000 (API)
if lsof -ti :4000 >/dev/null 2>&1; then
    echo "⚠️  Port 4000 is in use. Killing existing API process..."
    lsof -ti :4000 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# Kill any existing processes on port 3000 (Web)
if lsof -ti :3000 >/dev/null 2>&1; then
    echo "⚠️  Port 3000 is in use. Killing existing web process..."
    lsof -ti :3000 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# Check if API .env file exists
if [ ! -f "apps/api/.env" ]; then
    echo "❌ .env file not found at apps/api/.env"
    echo "Creating a basic .env file..."
    cat > apps/api/.env << EOL
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/poolcare"

# JWT Secret
JWT_SECRET="your-secret-key-change-in-production"

# API Port
PORT=4000
EOL
    echo "✅ Created apps/api/.env - Please update with your actual database credentials"
fi

echo ""
echo "📦 Installing dependencies (if needed)..."
pnpm install --silent 2>/dev/null || echo "Dependencies already installed"

echo ""
echo "🔧 Starting API server on port 4000..."
cd apps/api
PORT=4000 pnpm dev > ../../logs/api.log 2>&1 &
API_PID=$!
cd ../..

echo "✅ API server started (PID: $API_PID)"
echo "   Logs: logs/api.log"

# Wait for API to be ready
echo ""
echo "⏳ Waiting for API server to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:4000/api >/dev/null 2>&1; then
        echo "✅ API server is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "⚠️  API server taking longer than expected. Check logs/api.log"
        echo "   Continuing anyway..."
    fi
    sleep 1
done

echo ""
echo "🌐 Starting web frontend on port 3000..."
cd apps/web
pnpm dev > ../../logs/web.log 2>&1 &
WEB_PID=$!
cd ../..

echo "✅ Web frontend started (PID: $WEB_PID)"
echo "   Logs: logs/web.log"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 PoolCare is running!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📍 Web Frontend:  http://localhost:3000"
echo "📍 API Server:    http://localhost:4000/api"
echo ""
echo "📋 Process IDs:"
echo "   API: $API_PID"
echo "   Web: $WEB_PID"
echo ""
echo "📊 View logs:"
echo "   tail -f logs/api.log"
echo "   tail -f logs/web.log"
echo ""
echo "🛑 To stop both servers:"
echo "   kill $API_PID $WEB_PID"
echo "   or run: ./stop-all.sh"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Press Ctrl+C to stop both servers..."

# Save PIDs to file for stop script
echo $API_PID > .pids/api.pid
echo $WEB_PID > .pids/web.pid

# Wait for Ctrl+C
trap "echo ''; echo '🛑 Stopping PoolCare...'; kill $API_PID $WEB_PID 2>/dev/null; echo '✅ Stopped'; exit 0" INT TERM

# Keep script running
wait

