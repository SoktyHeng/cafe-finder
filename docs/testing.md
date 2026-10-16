# Testing

## Layers

| Layer | Tool | Location | Command |
|---|---|---|---|
| Unit | Vitest | `src/**/*.test.ts` next to the code | `pnpm test` |
| Component | Vitest + React Testing Library + jest-dom (jsdom) | `src/**/*.test.tsx` | `pnpm test` |
| Route integration | Vitest, handler with injected env and provider | `src/app/api/**/handler.test.ts` | `pnpm test` |
| End-to-end | Playwright (desktop Chrome and Pixel 7 projects) | `tests/e2e/*.spec.ts` | `pnpm test:e2e` |
| Accessibility | `@axe-core/playwright`, WCAG 2.0, 2.1 and 2.2 A/AA rules | `tests/e2e/accessibility.spec.ts` | `pnpm test:e2e` |

## Conventions

- Prefer accessible queries (`getByRole`, `getByLabelText`). Use `data-testid` only for elements without a natural role.
- Vitest aliases `server-only` to [src/test/server-only-stub.ts](../src/test/server-only-stub.ts), so server modules can be unit tested.
- Test environment parsing through the pure `parseServerEnv` and `parsePublicEnv` functions with explicit inputs. Never mutate `process.env` in tests.
- E2E runs a **production build** in fixture mode on port 3100 (`reuseExistingServer` outside CI). E2E must never call Google or Supabase. Upstream APIs are mocked from M2 onward.
- Default CI must never call Google APIs.

## Recommendation engine tests (M3)

| Test | Covers |
|---|---|
| `lib/recommendation/score.test.ts` | Weighted mean and neutral unknowns. Coverage, confidence and the hidden percentage. Bayesian rating. Contradictions (zero-review rating, temporarily closed but open now). Budget wording. Evidence-only Wi-Fi, quiet and atmosphere. Ties and deterministic order. Custom weights. Config validation. Invariants over 2,000 seeded random cafes |
| `lib/recommendation/relaxation.test.ts` | Only relaxations that help, with counts, radius steps and the maximum |
| `features/cafes/components/cafe-card.test.tsx` | Match badge, "Limited data", Best match, reasons, cautions, unverified preferences, breakdown table |
| `tests/e2e/ranking.spec.ts` | Ranked order, percentages, breakdown, Wi-Fi never claimed, one-click relaxation and radius widening |

## Google integration tests (M2)

Google is never called in tests or CI. `fetch` is injected into `GooglePlacesClient`.

| Test | Covers |
|---|---|
| `lib/google/places-client.test.ts` | Exact URLs, methods and bodies. Key only in the header, never in the URL. Pinned field masks with no wildcard or Atmosphere fields. 400/403/404/429 classified and not retried. 5xx and network errors retried once. Timeouts. Logs free of key and coordinates |
| `lib/places/google-normalize.test.ts` | Every field mapped. Missing means unknown, never defaulted. `openNow` never coerced. Enums, ranges and unsafe URLs dropped. Photos capped with credits. Attributions de-duplicated |
| `lib/places/google-provider.test.ts` | Bounded cafe-only request. Malformed places skipped. Errors mapped to unavailable or not found. Photo redirect host allowlisted |
| `app/api/places/**/handler.test.ts` | Route validation, 404, 429 with `Retry-After`, 503 without detail, and the redirect contract |
| `lib/security/*.test.ts` | Rate limiter windows, eviction, trusted and untrusted proxy keys, URL allowlists |
| `pnpm check:secrets` | Production build with canary secrets, then a scan of all build output for leaks |
| `pnpm smoke:live` | **Manual, billable**, against a server with a real key (see [deployment.md](deployment.md)) |

## E2E coverage

| Spec | Covers |
|---|---|
| `smoke.spec.ts` | Shell, responsive layout, skip link, security headers, 404 |
| `discovery.spec.ts` | Location denied → manual area → results. Location granted with rounded coordinates. No search while editing, exactly one per submit. Unknown values labelled. Empty state explanation. 503 error and retry. 429 message. Invalid link never searches. Keyboard-only flow. Mobile settings toggle |
| `accessibility.spec.ts` | axe scans of home and discover (idle, results, empty) on both viewports |
| `google-results.spec.ts` | Google-sourced results (mocked API response): attribution with providers, `translate="no"`, Google rating and open labels, Maps links, unknown fields, axe scan |
| `api.spec.ts` | Real server in fixture mode: nearby, details, 404, photo validation |

- Upstream failures and Google-sourced results are simulated with `page.route()` on `/api/places/nearby`. Fixture mode needs no network access.
- The E2E server raises the rate limits, because every test comes from one client.
- Geolocation uses Playwright's `grantPermissions`, `setGeolocation` and `clearPermissions`. No real position is used.

## First-time setup

```bash
pnpm exec playwright install chromium
```

## Quality gates (CLAUDE.md §13.4)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build
```
