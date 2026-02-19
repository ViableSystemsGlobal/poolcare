#!/bin/bash

# PoolCare Development Startup Script
# This script starts all development servers

set -e

echo "🚀 Starting PoolCare Development Environment..."
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env files exist
if [ ! -f "apps/api/.env" ]; then
    echo -e "${YELLOW}⚠️  apps/api/.env not found. Copying from .env.example...${NC}"
    if [ -f "apps/api/.env.example" ]; then
        cp apps/api/.env.example apps/api/.env
        echo -e "${GREEN}✅ Created apps/api/.env${NC}"
        echo -e "${YELLOW}⚠️  Please update DATABASE_URL and JWT_SECRET in apps/api/.env${NC}"
    else
        echo -e "${RED}❌ apps/api/.env.example not found!${NC}"
        exit 1
    fi
fi

if [ ! -f "apps/web/.env" ]; then
    echo -e "${YELLOW}⚠️  apps/web/.env not found. Copying from .env.example...${NC}"
    if [ -f "apps/web/.env.example" ]; then
        cp apps/web/.env.example apps/web/.env
        echo -e "${GREEN}✅ Created apps/web/.env${NC}"
    else
        echo -e "${RED}❌ apps/web/.env.example not found!${NC}"
        exit 1
    fi
fi

# Check if Prisma client is generated
echo "📦 Checking Prisma client..."
cd packages/db
if [ ! -d "node_modules/.prisma/client" ]; then
    echo "Generating Prisma client..."
    pnpm prisma generate
fi
cd ../..

# Check database connection (optional)
echo "🔌 Checking database connection..."
cd packages/db
if pnpm prisma db pull > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database connection OK${NC}"
else
    echo -e "${YELLOW}⚠️  Could not connect to database. Please ensure:${NC}"
    echo -e "${YELLOW}   1. PostgreSQL is running${NC}"
    echo -e "${YELLOW}   2. DATABASE_URL in apps/api/.env is correct${NC}"
    echo -e "${YELLOW}   3. Run: cd packages/db && pnpm prisma migrate dev${NC}"
fi
cd ../..

# Detect current LAN IP and sync into apps/client/.env so mobile always connects
echo "📱 Syncing mobile client network IP..."
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || echo "")
if [ -n "$LAN_IP" ]; then
    CLIENT_ENV="apps/client/.env"
    if [ ! -f "$CLIENT_ENV" ]; then
        echo "EXPO_PUBLIC_API_URL=http://localhost:4000/api" > "$CLIENT_ENV"
    fi
    # Update or add EXPO_PUBLIC_NETWORK_IP
    if grep -q "EXPO_PUBLIC_NETWORK_IP" "$CLIENT_ENV"; then
        sed -i.bak "s/EXPO_PUBLIC_NETWORK_IP=.*/EXPO_PUBLIC_NETWORK_IP=$LAN_IP/" "$CLIENT_ENV" && rm -f "$CLIENT_ENV.bak"
    else
        echo "EXPO_PUBLIC_NETWORK_IP=$LAN_IP" >> "$CLIENT_ENV"
    fi
    echo -e "${GREEN}✅ Mobile client IP set to $LAN_IP${NC}"
else
    echo -e "${YELLOW}⚠️  Could not detect LAN IP — update EXPO_PUBLIC_NETWORK_IP in apps/client/.env manually${NC}"
fi

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "To start servers:"
echo "  Terminal 1: cd apps/api && pnpm dev"
echo "  Terminal 2: cd apps/web && pnpm dev"
echo ""
echo "Or use Turbo:"
echo "  pnpm turbo dev"

