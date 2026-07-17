# syntax=docker/dockerfile:1
# Built OFF the VPS (CI/local) per DEPLOY_VPS.md — never build on the shared box.

FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl && npm install -g pnpm@9
WORKDIR /repo

# Workspace manifests first so dependency install caches across source changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/website/package.json apps/website/
COPY apps/carer/package.json apps/carer/
COPY apps/client/package.json apps/client/
COPY packages/db/package.json packages/db/
COPY packages/ui/package.json packages/ui/
COPY packages/utils/package.json packages/utils/
RUN pnpm install --frozen-lockfile --filter @poolcare/api...

COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @poolcare/db generate && pnpm --filter @poolcare/api build

# Prune to the api's production deps (workspace packages included), then bring
# the prisma schema + migrations along and regenerate the client in place so
# the runtime image can also run `prisma migrate deploy` as a one-shot.
# The CLI lives in its own dir: /out/package.json still has workspace:* specifiers
# that npm can't install into.
RUN pnpm --filter @poolcare/api deploy --prod /out && cp -r packages/db/prisma /out/prisma
RUN mkdir /prisma-cli && cd /prisma-cli && npm init -y >/dev/null \
  && npm install prisma@$(node -p "require('/repo/packages/db/node_modules/prisma/package.json').version") \
  && cd /out && /prisma-cli/node_modules/.bin/prisma generate --schema prisma/schema.prisma

FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl curl
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=builder /out ./
COPY --from=builder /prisma-cli /prisma-cli
ENV PATH="/prisma-cli/node_modules/.bin:$PATH"
RUN mkdir -p /data/uploads
EXPOSE 4000
CMD ["node", "dist/main"]
