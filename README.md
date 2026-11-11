# Revline

Bills of materials and engineering drawings for a building-systems engineering
team (fire, security, BMS, low-current). Projects hold BOMs with P/C revisions,
a drawing register with approvals, transmittals and PDFs, a catalog with
vendors, and a personal "My work" list. Single workspace, no public sign-up:
an admin creates the users.

[![CI](https://github.com/tshamugia/bom/actions/workflows/ci.yml/badge.svg)](https://github.com/tshamugia/bom/actions/workflows/ci.yml)

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui ·
Drizzle ORM · Postgres · better-auth · S3 · Zustand · exceljs · Vitest · Playwright.
The DXF checker in `services/dxf-checker` is Python (FastAPI + ezdxf).

## Quick start

```bash
cp .env.example .env.local
# Generate a real BETTER_AUTH_SECRET and paste it into .env.local:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

docker compose up -d db s3   # Postgres + MinIO
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000 and sign in as the root admin that `db:seed` creates
(email and password are in `src/db/seed.ts`; change the password in Settings →
Profile). There is no `/sign-up`: new people are added from `/users`, and an
admin-set password has to be changed at the first sign-in.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) on http://localhost:3000 |
| `npm run build` | Production build (`output: "standalone"`) |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Typecheck |
| `npm test` | Vitest, once |
| `npm run test:e2e` | Playwright (starts `npm run dev`; first run `npx playwright install chromium`) |
| `npm run db:generate` | Generate a migration from the schema |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Seed dev data and the root user |
| `npm run db:studio` | Drizzle Studio |

**The server tests truncate every table** in the database `DATABASE_URL`
points at. Give them their own database:

```bash
docker exec bom-postgres psql -U bom -d bom -c "create database bom_test"
DATABASE_URL=postgres://bom:bom@localhost:5432/bom_test npx drizzle-kit migrate
DATABASE_URL=postgres://bom:bom@localhost:5432/bom_test npx vitest run
```

The Playwright suite is gentler: before each run it recreates only the projects
named `E2E …` (and removes the `E2E…` items and vendors earlier runs added), so it
can run against the dev database.

## Layout

| Path | |
|---|---|
| `src/app/(app)`, `src/app/(auth)` | Signed-in app and the sign-in / password pages |
| `src/app/api` | Route handlers (auth, exports, drawing files, `/api/health`) |
| `src/server/actions`, `src/server/queries` | Server actions (mutations) and read loaders |
| `src/db/schema`, `src/db/migrations` | Drizzle schema and migrations |
| `src/proxy.ts` | Route protection (Next 16's renamed middleware) |
| `services/dxf-checker` | DXF standards checker, its own Railway service |
| `tests/unit`, `tests/e2e` | Vitest and Playwright |
| `.github/workflows` | CI, images, release, deploy |

`CLAUDE.md` describes the architecture and the rules in detail (roles, statuses,
revisions, drawings, My work, UI conventions).

## CI/CD

| Workflow | When | What |
|---|---|---|
| `ci.yml` | every pull request and push to `main` | lint, types, migrations + Vitest on Postgres 18, Playwright e2e on a production build, dxf-checker pytest, Docker builds; `main` pushes `ghcr.io/tshamugia/bom:main` and `bom-dxf-checker:main` |
| `release.yml` | tag `vX.Y.Z` | checks the tag against `package.json`, reruns CI, pushes `X.Y.Z`, `X.Y`, `latest`, deploys, creates the GitHub release |
| `deploy.yml` | called by a release, or by hand | points Railway `dxf-checker` and `bom` at an image version, waits for both, checks `/api/health` |

### Releasing

```bash
npm version 0.1.3 --no-git-tag-version   # in a PR, merged to main
git checkout main && git pull
git tag -a v0.1.3 -m "v0.1.3 — Short title" -m "What changed, for the release notes."
git push origin v0.1.3
```

Migrations run when the new container starts. Back up Postgres in Railway
before a release whose migrations rewrite data: rolling back an image doesn't
undo a migration.

### Rolling back

```bash
gh workflow run deploy.yml -f version=0.1.2
```

### One-time setup

- Railway project token for the production environment → repository secret
  `RAILWAY_TOKEN`; app URL → repository variable `APP_URL`.
- The GHCR packages `bom` and `bom-dxf-checker` are public, so Railway pulls
  them without credentials. The images hold no secrets; the runtime config is
  the Railway service variables.
- Automatic DXF checks: the `bom` service needs `DXF_CHECKER_URL`
  (`http://dxf-checker.railway.internal:8080`), `DXF_CHECKER_SECRET` (the same
  value as on `dxf-checker`) and `APP_INTERNAL_URL` (its own private address,
  `http://bom.railway.internal:<PORT>`); `dxf-checker` needs
  `ALLOWED_DOWNLOAD_HOSTS` (the bucket host) and `ALLOWED_CALLBACK_HOSTS`
  (`bom.railway.internal`). An admin then turns checks on in Settings → Drawings.
