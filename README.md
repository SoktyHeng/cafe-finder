# Cafe Finder

Personalized, location-aware cafe discovery. Initial market: Phnom Penh, Cambodia.

> **Status: M1 (discovery UI and location) complete.** Search works end to end with **fictional fixture cafes**. Google Places is not connected yet (M2). See [docs/milestones.md](docs/milestones.md).

## Stack

Next.js 16 (App Router, Cache Components, Turbopack) · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui (Radix, Nova preset) + Lucide · Zod 4 · Vitest + React Testing Library · Playwright · pnpm.

## Quick start

Requirements: Node.js 24 LTS or newer, pnpm (`npm install -g pnpm`).

```bash
pnpm install
cp .env.example .env.local   # optional; every value has a safe default
pnpm dev                     # http://localhost:3000
```

The app starts in **fixture mode** (`PLACES_PROVIDER=fixture`) with no Google or Supabase keys. Fixture mode only uses fictional demo data, and the footer, the results header and each card say so.

Try it: open `/`, pick an area (for example "BKK1") or use your location, then press **Find My Cafe**.

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
  app/                 routes: / , /discover, POST /api/places/nearby, error boundaries
  components/          app shell and shadcn/ui primitives (ui/)
  features/discovery/  search form, URL state, geolocation, search hook, results states
  features/cafes/      cafe card and formatting
  lib/config/          validated environment
  lib/discovery/       discovery request schema (shared client/server)
  lib/places/          CafePlace DTO, PlacesProvider, fixture provider + fictional data
  lib/recommendation/  hard filters and interim ordering
  lib/geo/ lib/locations/ lib/security/
tests/e2e/             Playwright specs (smoke, discovery, accessibility)
docs/                  architecture, API contracts, testing, milestones
```

Folders for later milestones (`lib/google/`, `lib/supabase/`, `supabase/` and others) are created in the milestone that needs them. See CLAUDE.md §5. API details are in [docs/api-contracts.md](docs/api-contracts.md).

## Known limitations

- Only fictional fixture data so far. The live Google Places provider, rate limiting and quotas arrive in M2.
- Results are ordered by straight-line distance. Explainable ranking arrives in M3.
- Budget, Wi-Fi, quietness and purpose fit can't be verified yet. They are shown as "not verified" and never filter results.
- Manual location means choosing one of the approximate Phnom Penh areas. There is no address search or map yet (M4).
- There is no map, cafe details page or directions yet (M4).
- Dark mode tokens exist, but nothing applies them yet. Privacy and terms pages are planned before production (M8).
