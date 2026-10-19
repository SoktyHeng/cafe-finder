# Cafe Finder

The responsive consumer UI and its page-by-page audit are documented in [UI/UX review](docs/ui-ux-review.md). Design QA includes explicit 375, 768, 1024 and 1440px route checks, with separate enabled-assistant and signed-out-auth browser suites.

M7 adds an optional conversational search assistant at `/assistant`. It is **off by default**. The configured AI provider parses preferences only; the existing Places provider, approved community evidence, and deterministic recommendation engine supply all cafe facts and match explanations. See the M7 entry in [milestones](docs/milestones.md) for verification status; M8 has not started.

To try the scripted offline demo, set `ENABLE_AI=true`, `AI_PROVIDER=fixture`, and `PLACES_PROVIDER=fixture`, then rebuild/restart. Try “Find a quiet cafe with Wi-Fi under $5 in BKK1.” followed by “Only open now, within 2 km.” This mode is labelled as a scripted demo and does not call OpenAI.

For real language interpretation, use `AI_PROVIDER=openai` and set `OPENAI_API_KEY` in ignored `.env.local`. Keep `PLACES_PROVIDER=fixture` for fictional cafe results, or use your configured `google` provider for live Places results. The key remains server-side. Read [deployment](docs/deployment.md#optional-ai-search-m7) before enabling.

NVIDIA-hosted GPT-OSS is also supported: set `ENABLE_AI=true`, `AI_PROVIDER=nvidia`, and `NVIDIA_API_KEY` in an ignored env file. The fixed model is `openai/gpt-oss-20b` on NVIDIA NIM. Your selected coordinates and cafe records are not sent to either AI provider. `pnpm test:ai:live` evaluates whichever live provider is selected.

Personalized, location-aware cafe discovery. Initial market: Phnom Penh, Cambodia.

> **Status: M6 (community amenities) complete.** Guests can search, view the map, read details and read member reports without an account. Signed-in members can save favorites, mark visits and save search defaults. They can also report Wi-Fi, outlets, noise, seating and laptop-friendliness, write reviews, vote and flag. Approved member reports feed the ranking as separately labelled evidence, never mixed with Google data. Everything is protected by Postgres Row Level Security, limits and basic moderation. Without Supabase, the site runs in guest-only mode. See [docs/milestones.md](docs/milestones.md).

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

### Live Google data

```bash
# .env.local
PLACES_PROVIDER=google
GOOGLE_PLACES_SERVER_API_KEY=<server key restricted to "Places API (New)">
# Optional, for the map: a SEPARATE key restricted by HTTP referrer + "Maps JavaScript API"
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=<browser key>
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=<map id; optional in development>
# Optional, for accounts (M5): Supabase project URL + publishable key, then apply supabase/migrations
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

Rebuild or restart after changing the provider. Before going live, read [docs/deployment.md](docs/deployment.md) (key restrictions, quotas, budget alerts, `TRUST_PROXY`) and [docs/google-maps-compliance.md](docs/google-maps-compliance.md) (field masks and SKUs, no caching, attribution). `pnpm smoke:live` verifies a running live server and makes about 3 billable calls.

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
| `pnpm check:secrets` | Production build with canary secrets, then a scan of the output for leaks |
| `pnpm smoke:live` | Manual check of a running live-mode server (billable) |

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
  lib/google/          server-only Places API (New) client, field masks, error mapping
  lib/places/          DTOs, PlacesProvider, Google + fixture providers, normalization
  lib/recommendation/  hard filters, weighted scoring, explanations, relaxation
  lib/security/        error contract, rate limits, URL allowlists
  lib/geo/ lib/locations/ lib/observability/
tests/e2e/             Playwright specs (smoke, discovery, accessibility)
supabase/migrations/   versioned SQL (tables, RLS, triggers) + rollback notes
docs/                  architecture, data model, API contracts, testing, milestones
```

Folders for later milestones (`lib/supabase/`, `supabase/` and others) are created in the milestone that needs them. See CLAUDE.md §5. API details are in [docs/api-contracts.md](docs/api-contracts.md).

## Known limitations

- Live mode needs your own Google key. CI and E2E use fixtures and mocked responses only.
- Rate limits are in memory, per server instance. Google Cloud quotas are the hard ceiling.
- The map needs a browser key. Without one, a "Map not available" panel is shown and everything else works.
- Details pages cost one Place Details call (Enterprise + Atmosphere) per view, plus one Place Photo call per photo shown. Only the first photo loads automatically.
- Wi-Fi, quietness and work/relax fit come only from member reports (M6). Most cafes have none yet, so these count as neutral and are shown as "not verified". Friends and date fit have no source. The scoring weights are initial hypotheses, not yet calibrated.
- Budget and member-reported preferences never filter results. They only affect ranking.
- Manual location means choosing one of the approximate Phnom Penh areas. There is no address search or map yet (M4).
- Dark mode tokens exist, but nothing applies them yet. Privacy and terms pages are planned before production (M8).
