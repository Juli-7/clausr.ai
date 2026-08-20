# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Build engine first
FROM base AS engine-builder
COPY clausr.ai/packages/engine ./clausr.ai/packages/engine
WORKDIR /app/clausr.ai/packages/engine
RUN pnpm install && pnpm build

# Build platform-core
FROM base AS platform-builder
COPY raipple-saas/pnpm-workspace.yaml ./raipple-saas/
COPY raipple-saas/package.json ./raipple-saas/
COPY raipple-saas/pnpm-lock.yaml ./raipple-saas/
COPY raipple-saas/packages/platform-core/package.json ./raipple-saas/packages/platform-core/
COPY --from=engine-builder /app/clausr.ai /app/clausr.ai
WORKDIR /app/raipple-saas
RUN pnpm install --frozen-lockfile

COPY raipple-saas/packages/platform-core ./packages/platform-core
RUN pnpm --filter @raipple/platform-core run build

# Build Next.js app
FROM base AS app-builder
COPY raipple-saas/pnpm-workspace.yaml ./raipple-saas/
COPY raipple-saas/package.json ./raipple-saas/
COPY raipple-saas/pnpm-lock.yaml ./raipple-saas/
COPY raipple-saas/apps/clausr/package.json ./raipple-saas/apps/clausr/
COPY raipple-saas/packages/platform-core/package.json ./raipple-saas/packages/platform-core/
COPY --from=engine-builder /app/clausr.ai /app/clausr.ai
COPY --from=platform-builder /app/raipple-saas/node_modules /app/raipple-saas/node_modules
COPY --from=platform-builder /app/raipple-saas/packages/platform-core/dist /app/raipple-saas/packages/platform-core/dist
WORKDIR /app/raipple-saas
RUN pnpm install --frozen-lockfile

COPY raipple-saas/apps/clausr ./apps/clausr
COPY raipple-saas/packages/platform-core ./packages/platform-core
COPY raipple-saas/skills ./skills
RUN pnpm --filter @raipple/clausr run build

# Runtime
FROM node:22-alpine AS runner
RUN apk add --no-cache tini
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=app-builder /app/raipple-saas/apps/clausr/.next ./.next
COPY --from=app-builder /app/raipple-saas/apps/clausr/public ./public
COPY --from=app-builder /app/raipple-saas/apps/clausr/package.json .
COPY --from=app-builder /app/raipple-saas/apps/clausr/next.config.ts .
COPY --from=app-builder /app/raipple-saas/node_modules ./node_modules
COPY --from=app-builder /app/raipple-saas/packages/platform-core/dist ./node_modules/@raipple/platform-core
COPY --from=app-builder /app/raipple-saas/skills ./skills
COPY --from=app-builder /app/raipple-saas/apps/clausr/eng.traineddata ./eng.traineddata

RUN mkdir -p /app/data

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["pnpm", "start"]
