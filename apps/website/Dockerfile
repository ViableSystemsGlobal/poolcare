# syntax=docker/dockerfile:1
# Public marketing site. Built OFF the VPS (CI/local) per DEPLOY_VPS.md — never
# build on the shared box.
#
# NEXT_PUBLIC_* are inlined at BUILD time and are SEO-critical here: every
# canonical URL, og:url, sitemap.xml entry, robots.txt Sitemap line and llms.txt
# link derives from NEXT_PUBLIC_SITE_URL. Building without these args ships a
# site that tells Google it lives at http://localhost:3003.
#
#   NEXT_PUBLIC_SITE_URL=https://poolcare.africa
#   NEXT_PUBLIC_API_URL=https://api.poolcare.africa/api
#   NEXT_PUBLIC_STUDIO_ORIGIN=https://admin.poolcare.africa   (Studio live-preview origin)

FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat && npm install -g pnpm@9
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
RUN pnpm install --frozen-lockfile --filter @poolcare/website...

COPY packages ./packages
COPY apps/website ./apps/website

ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_STUDIO_ORIGIN
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_STUDIO_ORIGIN=$NEXT_PUBLIC_STUDIO_ORIGIN \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @poolcare/website build

FROM node:20-alpine AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=builder /repo/apps/website/.next/standalone ./
COPY --from=builder /repo/apps/website/.next/static ./apps/website/.next/static
COPY --from=builder /repo/apps/website/public ./apps/website/public
EXPOSE 3000
CMD ["node", "apps/website/server.js"]
