# Milestones — actual status

| Milestone | Status |
|---|---|
| M0 — Repository foundation | ✅ Complete (2026-10-16) |
| M1 — Discovery UI and location | ✅ Complete (2026-10-16) |
| M2 — Google Places live provider | Not started |
| M3 — Ranking and filters | Not started |
| M4 — Maps and cafe details | Not started |
| M5 — Auth and favorites | Not started |
| M6 — Original community amenities | Not started |
| M7 — Optional natural-language discovery | Not started |
| M8 — Production readiness and launch | Not started |

## M1 — Discovery UI and location

### Delivered

- **Home page (`/`)**: the promise and the full search form. Submitting opens `/discover` with the search in the URL. No account is needed.
- **Location**: "Use my current location" asks the browser only on click, with consent text. It handles denied, unavailable, timeout and unsupported cases and warns on low accuracy. The manual fallback is a searchable list of approximate Phnom Penh areas: matches on names and landmark aliases, and Enter picks the first match. Device coordinates are rounded to about 110 m.
- **Filters**: purpose chips (Work/Study, Relax/Read, Friends, Date), distance slider (1 km up to the configured maximum), minimum rating, and open-now. The budget, Wi-Fi and quiet preferences carry an explicit "can't verify" disclaimer.
- **`/discover`**: the URL holds the search, so results are bookmarkable and the back button works. Results are list-first on mobile, with an "Edit search" toggle, and use a two-column layout on desktop. States: idle, loading skeleton, results, empty (with exclusion counts), error (with retry where useful), and an invalid link reset.
- **Cafe cards**: the source is labelled on the rating ("Google rating" or "Demo rating"), distance is shown as straight-line, and opening status names its source. Unknown values are labelled: "No rating yet", "Opening hours unknown", "Distance unknown". Cards also show a qualitative price level when present, a temporarily-closed badge, a "Demo data" badge, and the user's preferences as "Not verified for this cafe".
- **`POST /api/places/nearby`**: Zod-validated, JSON only, at most 2 KB, configured maximum radius enforced, safe error contract. It is backed by `PlacesProvider` and `FixturePlacesProvider` (15 fictional cafes, including deliberately missing fields). See [api-contracts.md](api-contracts.md).
- **Hard filters**: remove only positive evidence of a mismatch. Unrated cafes and unknown hours are kept and labelled.
- An accessibility fix found by axe: the light-theme destructive colour was darkened, because red badge text failed WCAG AA contrast.

### Acceptance verification (2026-10-16, Windows 11, Node 24.19.0)

| Criterion | Evidence |
|---|---|
| User can complete the flow with location denied | E2E "location denied": permission cleared, blocked message shown, BKK1 picked through search, results rendered (desktop and mobile) |
| No automatic billable search | E2E: 0 API calls while editing the radius, rating, open-now and purpose controls; exactly 1 per submit; 0 for an invalid link. Unit test: 1 fetch under React Strict Mode |
| Accessible on mobile and desktop | axe-core WCAG 2.0, 2.1 and 2.2 A/AA scans show 0 violations on `/` and `/discover` (idle, results, empty) for both projects. E2E keyboard-only flow passes. Touch targets are at least 44 px. Results have a polite live region and errors use alerts |
| Validated inputs | Server: strict Zod schema with no coercion, a field-name-only error message, body size limit and content-type check. Client: URL params validated, so invalid links are reset and never searched. Covered by unit and route tests |
| Uses fixtures with clear labelling | Footer, results header and card badges all say "demo". Fixture IDs are `fixture-NNN` |

Commands and results:

| Command | Result |
|---|---|
| `pnpm lint` | Pass |
| `pnpm typecheck` | Pass |
| `pnpm test` | 18 files, 174 tests passed |
| `pnpm build` | Pass: `/` and `/discover` static, `/api/places/nearby` dynamic |
| `pnpm test:e2e` | 37 passed, 1 skipped (the mobile-only test on the desktop project) |

### Deviations

- DTO fields `googleRating` and `googleRatingCount` are renamed `rating` and `ratingCount`, because fixture data is not Google data. The source is always labelled.
- Basic hard filters (rating and open-now, unknowns kept) were implemented in M1, so the M1 controls do something honest. Scoring, match reasons, confidence and one-click relaxation remain M3.
- The "search bar" is a search over predefined areas. Address or place autocomplete would use a Google API and belongs to M2 or M4 after a cost and policy review.
- See [architecture.md](architecture.md#deviations-from-claudemd) for the module placement deviations.

### Remaining risks and follow-ups

- No rate limiting yet. It is required before the live provider is enabled (M2).
- Opening or reloading a `/discover` results URL runs that search once. That is user-initiated navigation, but it is billable once M2 is live. Revisit with rate limits.
- The area centre coordinates are approximate and need verification before production.
- Dark mode is still not applied.

## M0 — Repository foundation

### Delivered

- Next.js 16.4.1 App Router project with React 19.3, TypeScript strict mode, Turbopack, Cache Components, pnpm 12, and `src/` layout.
- Tailwind CSS 4, shadcn/ui (Radix base, Nova preset, Lucide icons), and a warm coffee-toned neutral palette. Animations are disabled under `prefers-reduced-motion`.
- Responsive site shell: skip link, header, `<main>` landmark, footer with a fixture-mode notice, and a home page that says search is not available yet.
- Error handling: `error.tsx` (route errors), `global-error.tsx` (root layout errors), and `not-found.tsx`. The UI never renders raw error messages.
- Zod-validated server and public environment, defaulting to `PLACES_PROVIDER=fixture`. The server validates it at startup through `instrumentation.ts`.
- Baseline security headers (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`). `X-Powered-By` is disabled.
- Vitest + React Testing Library + jest-dom, and Playwright with desktop and mobile Chromium projects.
- Scripts: `lint`, `typecheck`, `test`, `test:watch`, `test:e2e`, `check`.
- README, `.env.example`, and docs.

### Acceptance verification (2026-10-16, Windows 11, Node 24.19.0)

| Criterion | Evidence |
|---|---|
| Starts locally without Google/Supabase keys in fixture mode | `pnpm dev` served `/` with HTTP 200, no `.env.local` present, and showed the "Demo mode" notice |
| Home page responsive | E2E checks for no horizontal overflow at a desktop viewport and on Pixel 7 |
| Baseline unit tests pass | `pnpm test`: 4 files, 26 tests passed |
| Baseline E2E smoke passes | `pnpm test:e2e`: 10 tests passed (5 specs × 2 projects) |
| Lint, typecheck and build pass | `pnpm lint`, `pnpm typecheck` and `pnpm build` passed with no errors |
| No secret committed | No `.env*` files exist except `.env.example`, which contains placeholders only. `.gitignore` excludes `.env*` but keeps `!.env.example` |
| Misconfiguration fails fast without leaking values | `next start` with `PLACES_PROVIDER=google` and no key failed at startup. The error listed variable names only |

### Deviations from CLAUDE.md

- In `.env.example`, `NEXT_PUBLIC_SUPABASE_URL` is empty instead of `https://your-project.supabase.co`, so a copied example is not mistaken for a configured project.
- `NODE_ENV` is commented out in `.env.example`. Next.js sets it itself.
- The Vitest config is `vitest.config.mts` (ESM), as the Next.js 16 testing guide recommends.
- `AGENTS.md` is generated and maintained by Next.js 16. It points coding agents at the bundled version-matched docs.

### Remaining risks and follow-ups

- `PLACES_PROVIDER` is baked into prerendered pages. Changing it requires a rebuild. This is acceptable because the provider is a deploy-time setting.
- There is no Content-Security-Policy yet. It will be added once the Google Maps script origins are known (M4).
- There is no CI pipeline yet (M8). Run `pnpm check && pnpm test:e2e` locally.
