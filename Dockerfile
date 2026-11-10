FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# `next build` imports src/lib/env.ts, which validates these. They are build-only
# placeholders: the image is built once in GitHub Actions and published to GHCR,
# and the real values come from the Railway service variables at runtime. The
# app reads them through `env` at runtime, so nothing here ends up in the bundle.
# Never pass secrets as build args.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-time-placeholder-not-a-secret-0000 \
    BETTER_AUTH_URL=http://localhost:3000 \
    NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000 \
    AWS_REGION=us-east-1 \
    S3_BUCKET=build \
    EMAIL_FROM=build@example.com \
    npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# EMAIL_FROM, SMTP_* and S3 settings come from the Railway service variables
# at runtime — never bake credentials into the image.

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/src/db/migrations ./src/db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/drizzle-orm ./node_modules/drizzle-orm

USER nextjs

# Set by .github/workflows/images.yml; /api/health reports them.
ARG APP_VERSION=dev
ARG APP_REVISION=
ENV APP_VERSION=$APP_VERSION \
    APP_REVISION=$APP_REVISION

EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
