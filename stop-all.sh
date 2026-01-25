#!/bin/bash

# PoolCare Stop Script
# Stops both API server and web frontend

echo "🛑 Stopping PoolCare..."

# Kill processes by PID if available
if [ -f ".pids/api.pid" ]; then
    API_PID=$(cat .pids/api.pid)
    if kill -0 $API_PID 2>/dev/null; then
        kill $API_PID 2>/dev/null
        echo "✅ Stopped API server (PID: $API_PID)"
    fi
    rm .pids/api.pid
fi

if [ -f ".pids/web.pid" ]; then
    WEB_PID=$(cat .pids/web.pid)
    if kill -0 $WEB_PID 2>/dev/null; then
        kill $WEB_PID 2>/dev/null
        echo "✅ Stopped web frontend (PID: $WEB_PID)"
    fi
    rm .pids/web.pid
fi

# Fallback: kill by port
if lsof -ti :4000 >/dev/null 2>&1; then
    lsof -ti :4000 | xargs kill -9 2>/dev/null
    echo "✅ Killed process on port 4000 (API)"
fi

if lsof -ti :3000 >/dev/null 2>&1; then
    lsof -ti :3000 | xargs kill -9 2>/dev/null
    echo "✅ Killed process on port 3000 (Web)"
fi

echo "✅ PoolCare stopped"

