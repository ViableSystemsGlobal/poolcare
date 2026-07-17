# syntax=docker/dockerfile:1
# Built OFF the VPS (CI/local) per DEPLOY_VPS.md — never build on the shared box.
# NEXT_PUBLIC_* are inlined at build time: pass NEXT_PUBLIC_API_URL as a build arg
# (production: https://api.poolcare.africa/api).

FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl && npm install -g pnpm@9
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/website/package.json apps/website/
COPY apps/carer/package.json apps/carer/
COPY apps/client/package.json apps/client/
COPY packages/db/package.json packages/db/
COPY packages/ui/package.json packages/ui/
COPY packages/utils/package.json packages/utils/
RUN pnpm install --frozen-lockfile --filter @poolcare/web...

COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm --filter @poolcare/db generate

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @poolcare/web build

FROM node:20-alpine AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
