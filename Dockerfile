FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl

FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/design-tokens/package.json packages/design-tokens/package-lock.json ./packages/design-tokens/
RUN npm ci && npm --prefix packages/design-tokens ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/design-tokens/node_modules ./packages/design-tokens/node_modules
COPY . .

RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
ARG DEPLOYMENT_VERSION=development
ENV DEPLOYMENT_VERSION=$DEPLOYMENT_VERSION
RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" \
    AUTH_SECRET="build-only-not-used-at-runtime" \
    NODE_OPTIONS="--max-old-space-size=4096" \
    npm run build && \
    rm -rf /app/.next/standalone/.keys

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
RUN mkdir -p /app/.next/cache && chown -R nextjs:nodejs /app/.next

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1

STOPSIGNAL SIGTERM
CMD ["node", "server.js"]
