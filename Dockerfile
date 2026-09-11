# ---- Stage 1: install dependencies -----------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
# node:22-alpine ships an npm whose `ci` is overly strict about unsatisfied
# *optional* peer dependencies (e.g. @swc/core's optional peer on
# @swc/helpers, which next-intl pulls in but next itself pins to a version
# that doesn't satisfy it) and fails the install over something npm's own
# resolver considers fine. Newer npm handles this correctly.
RUN npm install -g npm@11
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# A separate, production-only dependency tree keeps the Prisma migration CLI
# available at startup without copying the application's entire build toolchain
# into the final image.
FROM node:22-alpine AS migrate-deps
WORKDIR /migrate
RUN npm install -g npm@11
COPY docker/runtime-migrations/package.json docker/runtime-migrations/package-lock.json ./
RUN npm ci --omit=dev

# ---- Stage 2: build ---------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_STANDALONE=1 makes next.config.ts emit the standalone server bundle
# that the runtime stage below copies from .next/standalone.
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_STANDALONE=1
# Dummy values so the build never needs the real .env; all real config is
# injected at runtime by docker-compose.
RUN DATABASE_URL="file:/tmp/build.db" \
    PHOTOS_DIR="/tmp/photos" \
    SESSION_SECRET="build-time-placeholder-secret-not-used" \
    APP_BASE_URL="http://localhost:3000" \
    npx prisma generate && npm run build

# ---- Stage 3: runtime -------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NODE_OPTIONS="--max-old-space-size=768" \
    MALLOC_ARENA_MAX=2

# Standalone server + static assets
# (no COPY for /app/public — this project has no Next.js public/ folder;
# all photos/logo are served at runtime from the PHOTOS_DIR volume via
# custom API routes instead)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma schema/migrations + its isolated CLI dependency tree for `migrate
# deploy` on startup. The standalone server already contains its own traced
# runtime dependencies.
COPY --from=builder /app/prisma ./prisma
COPY --from=migrate-deps /migrate/node_modules ./migration-node_modules

COPY docker-entrypoint.sh ./docker-entrypoint.sh
# Strip any stray \r (e.g. from a Windows-side edit) so the shebang always
# resolves to /bin/sh — a CRLF-corrupted shebang fails at exec time with a
# confusing "no such file or directory" instead of a syntax error.
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
