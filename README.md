# Cafe Finder

Personalized, location-aware cafe discovery. Initial market: Phnom Penh, Cambodia.

> **Status: M0 (repository foundation).** The site shell runs, but cafe search is not built yet. No Google or Supabase integration exists so far. See [docs/milestones.md](docs/milestones.md).

## Stack

Next.js 16 (App Router, Cache Components, Turbopack) · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui (Radix, Nova preset) + Lucide · Zod 4 · Vitest + React Testing Library · Playwright · pnpm.

## Quick start

Requirements: Node.js 24 LTS or newer, pnpm (`npm install -g pnpm`).

```bash
pnpm install
cp .env.example .env.local   # optional; every value has a safe default
pnpm dev                     # http://localhost:3000
```

The app starts in **fixture mode** (`PLACES_PROVIDER=fixture`) with no Google or Supabase keys. Fixture mode only uses fictional demo data, and the footer says so.

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `pnpm typecheck` | Generate Next.js route types, then `tsc --noEmit` |
| `pnpm test` / `pnpm test:watch` | Vitest unit and component tests |
| `pnpm test:e2e` | Playwright smoke tests (builds and starts the app on port 3100 in fixture mode) |
| `pnpm check` | lint + typecheck + unit tests |

Before running E2E tests for the first time, run `pnpm exec playwright install chromium`.

## Environment

Every variable is validated with Zod in [src/lib/config/](src/lib/config/):

- [env-schema.ts](src/lib/config/env-schema.ts): pure schemas and parsers (unit tested).
- [server-env.ts](src/lib/config/server-env.ts): `getServerEnv()`, server only (guarded by `server-only`).
- [public-env.ts](src/lib/config/public-env.ts): `getPublicEnv()`, the only `NEXT_PUBLIC_*` values that are safe for the browser.

[src/instrumentation.ts](src/instrumentation.ts) validates the environment when the server starts, so a misconfigured deployment fails immediately. Error messages list variable names and rules only, never values.

Rules:

- Empty values and the literal `replace-me` count as "not set".
- `PLACES_PROVIDER=google` requires a real `GOOGLE_PLACES_SERVER_API_KEY`. Fixture mode requires no keys.
- `MAX_SEARCH_RADIUS_METERS` must be an integer from 1000 to 15000. `DISCOVERY_RATE_LIMIT_PER_MINUTE` must be from 1 to 1000.
- `ENABLE_AI` and `ENABLE_COMMUNITY_REPORTS` accept only `true` or `false`.
- Only the browser Maps key and the Supabase URL and anon key may use the `NEXT_PUBLIC_` prefix. Server keys must never use it.
- `PLACES_PROVIDER` is read when pages are prerendered, so a change requires a rebuild.

## Project layout

```text
src/
  app/            routes, root layout, error/global-error/not-found boundaries
  components/     app shell (header, footer, error fallback) and shadcn/ui primitives in ui/
  lib/config/     validated environment
  lib/utils.ts    cn() class-name helper
  test/           Vitest setup and stubs
tests/e2e/        Playwright specs
docs/             architecture, testing and milestone status
```

Folders for later milestones (`features/`, `lib/places/`, `lib/google/`, `supabase/` and others) are created in the milestone that needs them. See CLAUDE.md §5.

## Known limitations

- There is no discovery UI, search API, map, or authentication yet (M1 to M5).
- Dark mode tokens exist, but nothing applies them yet.
- Privacy and terms pages are planned before production (M8).
