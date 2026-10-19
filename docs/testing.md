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

## Community tests (M6)

| Test | Covers |
|---|---|
| `src/test/db/community.test.ts` | 36 tests on the real migrations in PGlite, sharing [harness.ts](../src/test/db/harness.ts) with the RLS suite. Covers:<br>• own-row isolation, and that members can't set `status`<br>• one answer per amenity, and the allowed values<br>• review moderation patterns (URL, email, phone) without false positives on opening hours<br>• no self-votes or self-flags, and auto-hide at 3 flags<br>• moderator-only queue and decisions, with audit<br>• anonymized public reads for anon, with no table access<br>• daily caps<br>• account-deletion cascade<br>• upserts in the exact `insert … on conflict … do update set <all payload columns>` form PostgREST sends, and that key columns still can't change |
| `lib/community/aggregate.test.ts` | Weights, decay, consensus ties, sufficiency, conflicts, and the mapping to recommendation evidence |
| `lib/community/handlers.test.ts` | Public reads, 401 for guest writes, CSRF, strict schemas, error mapping without leaks, rate limits, moderator-only routes |
| `lib/community/supabase-store.test.ts` | Database error mapping, RPC row mapping, upsert conflict targets (never sends `status` or `user_id`) |
| `features/community/components/community-ui.test.tsx` | No requests in guest-only mode. Labelled member summaries. Sign-in prompt. Report and review forms and their validation. Pending-review message. Vote and flag only on others' reviews |
| `lib/recommendation/score.test.ts`, `api/places/nearby/handler.test.ts` | Graded evidence wording and its effect on rank. Search proceeds when community data fails |
| `tests/e2e/guest-mode.spec.ts` | Guest-only details page makes no community request. Guidelines page linked from the footer, passing axe. `/moderation` unavailable. Community API returns 503 and refuses cross-site writes |

## Auth and user data tests (M5)

| Test | Covers |
|---|---|
| `src/test/db/rls.test.ts` | The **real migration** in PGlite with Supabase's `auth` stubbed and its generous default grants. Cross-user read, write and delete isolation. Anonymous denial. TRUNCATE revoked. Constraints and the 500-row cap. New-user trigger. `delete_own_account()` cascades for the caller only |
| `lib/user-data/handlers.test.ts` | 401 without a session, 503 when unconfigured, CSRF (missing or foreign `Origin`, `Sec-Fetch-Site`), strict validation (no client `user_id`), error mapping without leaks, account-deletion confirmation, per-user rate limit |
| `lib/user-data/supabase-store.test.ts` | Exact tables, columns and conflict targets. Notes kept on re-save. Postgres error-code mapping. Preference row mapping. The delete RPC followed by local sign-out |
| `lib/supabase/proxy.test.ts` | Pass-through when unconfigured. Protected-path redirect with `next`. Rotated cookies and no-store headers forwarded |
| `lib/security/safe-redirect.test.ts`, `features/auth/credentials.test.ts` | Open-redirect defence. Password rules. Generic, non-enumerating auth errors |
| `features/favorites/components/favorites-ui.test.tsx`, `features/auth/components/auth-pages.test.tsx` | Save and Visited buttons per auth state, with optimistic toggle and rollback. Header links. Favorites list and notes. Login modes and errors. Safe `next`. Account defaults, profile, deletion phrase, sign-out. Saved defaults pre-filling the home form |
| `tests/e2e/guest-mode.spec.ts` | E2E runs without Supabase: guest search, details with no sign-in UI, "accounts aren't available" pages, 503 on user-data reads, 403 on cross-site mutations, safe auth-callback failures, axe |
| Manual live checklist | [deployment.md → Supabase setup](deployment.md#supabase-setup-m5) |

## Maps and details tests (M4)

The Maps JavaScript API can't run in jsdom or CI without a key, so it is never loaded in tests.

| Test | Covers |
|---|---|
| `features/discovery/components/results-with-map.test.tsx` | `@vis.gl/react-google-maps` mocked: list-first and lazy loading on mobile, markers and origin pin, marker → card (highlight, scroll, focus), card → marker (pan, `aria-pressed`), map kept mounted, missing key / `AUTH_FAILURE` / `FAILED` fallbacks, fit-bounds once |
| `features/cafes/components/cafe-details-view.test.tsx` | Facts, attribution, directions, website and phone links. One photo then more on request, with credits. Reviews with author attribution and a translation notice. Amenities yes/no/not listed and no Wi-Fi. Hours. Demo, loading, 404, invalid ID (no fetch), error and retry. Safe back links |
| `lib/google/maps-urls.test.ts`, `features/cafes/opening-hours.test.ts` | Directions URL encoding, no origin, none for demo cafes. Today's hours in the cafe's timezone, matched by weekday name |
| `lib/places/google-normalize.test.ts` | Review and amenity normalization, including unsafe links, missing authors, the 5-review cap and Wi-Fi never invented |
| `tests/e2e/details.spec.ts` | Results → details → back. Demo labelling. Mocked Google details (photos, credits, reviews, hours, amenities, links). Error and retry. Map fallback on desktop and mobile. No Maps request without a key. axe scans |
| Manual live checks | `pnpm smoke:live` (details with reviews and amenities). Rendering the real details page in a browser. The map with a real browser key (see [deployment.md](deployment.md)) |

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
- The E2E server raises the rate limits, because every test comes from one client, and sets an empty `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, so the map fallback is exercised and Google Maps is never loaded.
- Geolocation uses Playwright's `grantPermissions`, `setGeolocation` and `clearPermissions`. No real position is used.

## First-time setup

```bash
pnpm exec playwright install chromium
```

## Quality gates (CLAUDE.md §13.4)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build
```
