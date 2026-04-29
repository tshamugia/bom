# BOM Studio

Bill of Materials management for hardware teams.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui ·
Drizzle ORM · Postgres · better-auth · AWS S3 · Zustand · exceljs · Vitest · Playwright

## Quick start

```bash
cp .env.example .env.local
# Generate a real BETTER_AUTH_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Paste it into .env.local

docker compose up -d db
npm install
npm run db:migrate
npm run dev
```

Open http://localhost:3000 and create an account at `/sign-up`.

## Scripts

| Command            | Purpose                                   |
|--------------------|-------------------------------------------|
| `npm run dev`      | Next.js dev server (Turbopack)            |
| `npm run build`    | Production build                          |
| `npm test`         | Vitest unit suite                         |
| `npm run test:e2e` | Playwright end-to-end suite               |
| `npm run db:generate` | Generate a new migration              |
| `npm run db:migrate`  | Apply pending migrations              |
| `npm run db:studio`   | Open Drizzle Studio                   |

## Plans

Implementation is broken into six sequential plans under `docs/superpowers/plans/`.
This README covers Plan 01 (Foundation). Subsequent plans build on top.
