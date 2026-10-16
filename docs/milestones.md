# Milestones — actual status

| Milestone | Status |
|---|---|
| M0 — Repository foundation | ✅ Complete (2026-10-16) |
| M1 — Discovery UI and location | Not started |
| M2 — Google Places live provider | Not started |
| M3 — Ranking and filters | Not started |
| M4 — Maps and cafe details | Not started |
| M5 — Auth and favorites | Not started |
| M6 — Original community amenities | Not started |
| M7 — Optional natural-language discovery | Not started |
| M8 — Production readiness and launch | Not started |

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
