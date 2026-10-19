# Milestones — actual status

| Milestone | Status |
|---|---|
| M0 — Repository foundation | ✅ Complete (2026-10-16) |
| M1 — Discovery UI and location | ✅ Complete (2026-10-16) |
| M2 — Google Places live provider | ✅ Complete, including live verification (2026-10-16) |
| M3 — Ranking and filters | ✅ Complete (2026-10-16) |
| M4 — Maps and cafe details | ✅ Complete, including live map verification (2026-10-16) |
| M5 — Auth and favorites | ✅ Implemented and verified offline (2026-10-16). Live sign-in awaits a Supabase project |
| M6 — Original community amenities | ✅ Complete, including live database verification (2026-10-19). Upsert permission fix applied the same day |
| M7 — Optional natural-language discovery | Not started |
| M8 — Production readiness and launch | Not started |

## M6 — Original community amenities

### Delivered

- **Database** ([20261019031354_m6_community.sql](../supabase/migrations/20261019031354_m6_community.sql), documented in [data-model.md](data-model.md#community-m6)):
  - Tables: `amenity_reports` (Wi-Fi, outlets, noise, seating, laptop-friendly), `place_reviews`, `review_votes`, `content_flags`, `moderators` and `moderation_events`.
  - Places are referenced by Google place ID only.
  - **Duplicate prevention:** one answer per member, place and amenity; one review per member and place; one vote per member and review; one flag per member and item. Re-submitting updates the existing row.
  - **Limits:** daily and total caps per member, enforced by triggers.
  - **Status:** clients can't write it. Reviews containing a URL, email or phone number start pending. Edits to moderated content return to pending. Flags from 3 members hide content automatically.
  - **Access:** RLS on own rows, column-level grants, helpers in a `private` schema, and anonymized `SECURITY DEFINER` read functions that return approved content only.
  - **Visit confirmation:** reports and reviews from members who marked the place visited (M5 `visit_feedback`) are labelled "Confirmed visit" and weigh double.
- **Aggregation** ([lib/community/aggregate.ts](../src/lib/community/aggregate.ts)):
  - Weighted consensus per amenity, with 180-day decay and the sufficiency and conflict rules described in [recommendation-scoring.md](recommendation-scoring.md#community-evidence-m6).
- **Recommendations:**
  - Sufficient member summaries become graded `CafeEvidence` for Wi-Fi, quiet, and work or relax fit.
  - Every reason names "Cafe Finder members" and the evidence (report count, confirmed visits, latest date).
  - If community data is unavailable, search ranks on Google data alone.
- **API:** `/api/community/[placeId]` (public read), `…/amenities`, `…/review`, `/api/community/reviews/[id]/vote`, `/api/community/flags` and `/api/moderation`.
  - CSRF checks, strict schemas and per-member rate limits.
  - Database errors map to safe messages.
  - Shared route plumbing was extracted to `lib/http/route-helpers.ts`.
- **UI:**
  - Cards show "From Cafe Finder members (not Google)" badges.
  - The details page has a member section: summaries with counts and dates, a report form, the member's own review, and member reviews with Helpful/Not helpful and Report. The Google sections were renamed "Amenities from Google" and "Reviews from Google".
  - `/moderation` (moderators only) and `/community-guidelines` (rules, moderation, privacy), linked from the footer.

### Acceptance verification (2026-10-19)

| Criterion | Status | Evidence |
|---|---|---|
| Community info is separately sourced, never presented as Google data | ✅ | Separate tables and DTO field (`community`), with no Google data stored. Every badge, section and reason is labelled "Cafe Finder members". Google sections are labelled "from Google". Covered by component and scoring tests |
| Abuse mitigation in place | ✅ | Uniqueness constraints, daily and total caps, API rate limits, review moderation patterns, auto-hide at 3 flags, no self-votes or self-flags, moderator-only decisions with an audit trail. 36 database tests plus handler tests |
| Privacy policies in place | ✅ | `/community-guidelines` covers what's public, what's never shown (user IDs, names), deletion, and moderation. Public reads are anonymized. Account deletion cascades to all member content (tested). The full privacy page remains an M8 item |
| Only approved content influences recommendations | ✅ | The read functions return `status = 'approved'` rows only. Aggregation uses sufficient summaries only. Tested in PGlite and in the handler |
| RLS and cross-user isolation | ✅ | **PGlite:** own-row isolation, column grants, anon denied. **Live, hosted project** (rolled back afterwards, nothing kept): member B saw 0 of member A's rows and edited 0 rows; A couldn't set `status`, flag their own review, or open the moderation queue; a phone-number review was held as pending; anon could read only the anonymized functions |
| Running app against live Supabase | ✅ | Public GET returns 200. A cross-site PUT gets 403. A PUT without a session gets 401. `/moderation` signed out redirects to login |

| Command | Result |
|---|---|
| `pnpm lint`, `pnpm typecheck` | Pass |
| `pnpm test` | 46 files, 610 tests passed, including 56 database tests on real Postgres |
| `pnpm build` | Pass |
| `pnpm test:e2e` | 97 passed, 3 skipped (viewport-specific) |
| `pnpm check:secrets` | Pass (679 build files) |
| `supabase db advisors --linked` | WARN only: intentional `SECURITY DEFINER` functions (accepted, see [deployment.md](deployment.md#community-moderation-m6)) and leaked password protection off (a dashboard setting) |

### Bugs found and fixed while building

- **The status trigger referenced `new.body` for amenity reports.** It would have failed at run time on every report. Each branch now touches only its own table's columns.
- **"permission denied for schema private".** The trigger called a private helper with the member's privileges. The check is now inlined.
- **The phone pattern flagged opening hours** such as "7.00 - 21.00". It was replaced with word-bounded structured patterns.
- **`is_own` was NULL for guests.** It's now coalesced to false.
- **Every report, review and vote save failed live with "That action isn't allowed on this item"** (found in manual testing, 2026-10-19).
  - Cause: supabase-js `upsert()` becomes `insert … on conflict … do update set <all payload columns>`, and Postgres requires UPDATE privilege on each of them, including the key columns. Only content columns had been granted. The database tests and the first live check used plain `INSERT`, so they missed it.
  - Fix: migration `20261019035245_m6_upsert_grants.sql` grants UPDATE on the key columns and adds a trigger that rejects actual key changes.
  - Regression tests now issue upserts in PostgREST's exact form. A rolled-back live check on the hosted project confirmed: report create and update, review approved, phone-number review pending, vote create and change, and moving a report rejected.
- **A same-day report weighed 0.998**, just under the sufficiency threshold. Age is now counted in whole days.
- **UI:** the confirmation message vanished when the section refreshed. Previous data is now kept while reloading. The rating radios' accessible name read "5out of 5"; it's now a single "5 out of 5" label.

### Decisions and deviations

- Status starts **approved** (post-moderation) rather than pending. This keeps contributions useful at small scale while flags, caps and the review patterns limit abuse. Switching to pre-moderation means changing the default in the trigger.
- Moderators are added by an admin in SQL. There's no in-app moderator management.
- CLAUDE.md's `amenity` and `value` columns are kept as text, constrained by check constraints, not enums.
- Reviews are anonymous ("Cafe Finder member"), so no names are exposed.
- Friends and date fit have no member question, so they stay unknown.
- E2E runs in guest-only mode. Signed-in flows are covered by component, handler and database tests, the live SQL check, and the manual checklist in [deployment.md](deployment.md#community-moderation-m6).

### Remaining risks and follow-ups

- Signed-in UI flows (report, review, vote, flag, moderate) haven't been clicked through in a browser against the live project yet. Follow the manual checklist.
- The review patterns are a basic filter. Determined spam needs flags and moderators. Consider a moderation SLA and notifications in M8.
- The rate limiters are in memory, per instance; database caps are the hard limit.
- Trust weights (1 vs 0.5, a 180-day half-life, a sufficiency threshold of 1) are hypotheses. Recalibrate them once real reports exist.
- The privacy page and terms (M8) must cover member content.

## M5 — Auth and favorites

### Delivered

- **Database** ([supabase/migrations/20261016000000_m5_profiles_favorites.sql](../supabase/migrations/20261016000000_m5_profiles_favorites.sql), documented in [data-model.md](data-model.md)):
  - Tables: `profiles`, `user_preferences`, `favorite_places` (place ID plus private notes) and `visit_feedback`.
  - Constraints mirror the API.
  - Triggers: new-user profile/preferences creation, `updated_at`, and a 500-row cap per user.
  - RLS covers SELECT, INSERT, UPDATE and DELETE on every user-owned table. The default ALL grants, including RLS-bypassing TRUNCATE, are revoked, and `anon` gets nothing.
  - `delete_own_account()` deletes the caller's data in one step, so no service-role key is needed.
  - Rollback and backfill notes are included.
- **Auth** (`@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.117.2):
  - Email/password sign-in and sign-up as server actions: generic errors, no account enumeration, 8–72 character passwords, a per-client attempt limit.
  - Google OAuth with PKCE, through `/auth/callback`.
  - Email confirmation through `/auth/confirm` (`token_hash`).
  - Redirects are built from the configured app URL. `next` must be a same-site path.
- **Sessions:**
  - The Next.js 16 `proxy.ts` refreshes sessions on every request, forwarding the library's no-store headers.
  - It redirects signed-out visitors away from `/favorites` and `/account`.
  - Pages and APIs re-verify with `getClaims()` and never trust `getSession()`.
- **API:** `/api/favorites`, `/api/visits`, `/api/preferences`, `/api/profile` and `/api/account`.
  - Same-origin checks for mutations (CSRF), strict JSON schemas, a per-user rate limit, and safe error mapping.
  - Queries run **as the user**, so RLS is the final gate.
- **UI:**
  - Header links that change with sign-in state.
  - "Save" on cards and details, and "Mark as visited" on details, with optimistic updates and rollback.
  - Guests see "Sign in to save", which returns them to the same page after sign-in.
  - `/favorites`: notes, remove, visited list, and names refetched per view with a Pro-tier summary mask.
  - `/account`: profile, saved search defaults (reusing the search controls), sign-out, and account deletion confirmed by typing a phrase.
  - The home form starts from saved defaults.
- **Guest-only mode:** without Supabase, all sign-in UI is hidden and the account pages explain why. Search, map and details are unaffected.

### Acceptance verification (2026-10-16)

| Criterion | Status | Evidence |
|---|---|---|
| Guest search still functions | ✅ | All earlier E2E tests pass unchanged. `guest-mode.spec.ts` covers search and details with no sign-in UI. Component tests cover signed-out users seeing "Sign in to save" with no API calls |
| One user cannot read or change another's saved data | ✅ | **RLS:** the migration in real Postgres (PGlite 18.3) with Supabase's generous default grants stubbed. Cross-user SELECT, UPDATE and DELETE affect 0 rows; INSERT for another user and reassigning `user_id` are rejected; anonymous access and TRUNCATE are denied. **API:** the store never takes a user ID from the client, strict schemas reject `user_id`, there's 401 without a session and 403 cross-site |
| Persistent favorites across devices | ⏳ **Live check pending** | Favorites live in Postgres keyed by the auth user, and the logic is fully tested offline. Verifying on two browsers needs a Supabase project. Steps are in [deployment.md](deployment.md#supabase-setup-m5) |
| Google details refetched properly | ✅ | Only place IDs are stored. `/favorites` refetches summaries per view (Pro mask, 50 at most, 5 at a time, 10 page loads per user per minute) and degrades to "details unavailable" without failing |
| Data deletion | ✅ | `delete_own_account()` cascade test: the caller's rows in all 4 tables are removed and nobody else's. The API requires the typed confirmation phrase and rejects cross-site requests |

| Command | Result |
|---|---|
| `pnpm lint`, `pnpm typecheck` | Pass |
| `pnpm test` | 40 files, 503 tests passed, including 20 RLS tests on real Postgres |
| `pnpm build` | Pass (Proxy active) |
| `pnpm test:e2e` | 89 passed, 3 skipped (viewport-specific) |
| `pnpm check:secrets` | Pass (540 build files; the service-role canary is not present) |

### Bugs found and fixed while building

- **Postgres regex limit.** `{1,512}` in the place-ID check fails on Postgres, whose repetition counts are capped at 255. It would have broken every favorite on Supabase. It's now a character class plus `char_length`.
- **TRUNCATE bypasses RLS.** Supabase's default grants include it. The migration now revokes all privileges and grants back only the operations it needs.
- **Prerender blocked by `usePathname()` in the auth provider.** That hook is now isolated in its own Suspense boundary.

### Decisions and deviations

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase's current name) is the primary variable. `NEXT_PUBLIC_SUPABASE_ANON_KEY` from CLAUDE.md is accepted as a fallback. The server refuses to start if the service-role key is configured as a browser key.
- Visits are one record per place in M5. `liked` and `comment` are reserved for the M6 feedback work.
- The database types are hand-written to match the migration. Regenerate them with `supabase gen types` once a project is linked.
- There's no password-reset flow yet. Supabase's dashboard can send reset links. Add a `/account/update-password` flow in M8.
- E2E runs in guest-only mode. Signed-in behaviour is covered by unit, component and RLS tests, plus the manual live checklist.

### Remaining risks and follow-ups

- Live verification with a Supabase project: sign-up, email confirmation, Google OAuth, cross-device favorites, account deletion.
- Privacy and terms pages describing accounts and data deletion are needed before launch (M8).
- The auth-attempt and user-data rate limits are in memory, per instance (see M2's note).

## M4 — Maps and cafe details

### Delivered

- **Map** (`@vis.gl/react-google-maps` 1.10.1, the Google-sponsored React library for the Maps JavaScript API):
  - Numbered, keyboard-accessible Advanced Markers, a search-centre pin, fit to results once.
  - Two-way sync with the list. A marker click highlights, scrolls to and focuses its card. "Show on map" on a card pans to its marker.
  - Wide screens (1280 px and up) show list and map side by side. Smaller screens are list-first with a List/Map toggle.
  - The Maps JavaScript API loads only when the map is first shown, then stays mounted, so there are no repeat map loads.
  - A fallback appears with no key, a load failure or an auth failure. The list keeps working in every case.
- **`/cafes/[placeId]` details page:**
  - Rating, straight-line distance from the originating search, open status and price level.
  - Directions, "Open in Google Maps", website and phone links.
  - Photos with author credits. The first loads automatically, the rest only on request, because each one is billable.
  - Hours with today highlighted in the cafe's timezone, matched by weekday name.
  - Google-reported amenities shown as yes / no / not listed, with an explicit "Wi-Fi and noise level aren't provided by Google" note.
  - Up to 5 Google reviews with author name, photo and link, and a "Translated by Google" notice.
  - "Back to results" link, re-serialized from a validated search, never echoed.
  - Loading skeleton, not-found, and error with retry.
- **Directions** use official Maps URLs (`destination` + `destination_place_id`, no origin). There's no key and no cost. Demo cafes get no directions, because their coordinates are fictional.
- **Details data:** the field mask adds `reviews`, `accessibilityOptions`, `paymentOptions` and the amenity booleans, billed as Place Details Enterprise + Atmosphere, per opened page only. Search stays at Enterprise, enforced by a test. Reviews and amenities are normalized explicitly: unsafe links dropped, author required, at most 5, Wi-Fi never invented.
- **Security:**
  - A separate public browser key (referrer and Maps JavaScript API restricted) and an optional Map ID.
  - The server refuses to start if the browser key equals a server key.
  - Photos use plain `<img>`, so Google images are never fetched or cached by our server.
- **Shared plumbing:** `requestApi` (typed API calls that never throw) and `useKeyedRequest` (one call per action, deduplicated under Strict Mode), used by both search and details.

### Acceptance verification (2026-10-16)

| Criterion | Status | Evidence |
|---|---|---|
| List remains usable if Maps fails | ✅ | Component tests for no key, `AUTH_FAILURE` and `FAILED`. E2E on desktop (fallback beside the list, axe clean) and mobile (toggle to the fallback and back). E2E confirms no `maps.googleapis.com` request is made without a key |
| Attribution correct | ✅ | "Google Maps" text attribution on lists and details. Photo credits on every displayed photo. Review author name, photo and link. "View on / See all reviews on Google Maps" links. Google's own map attribution left untouched |
| Detail load does not fetch unnecessarily | ✅ | One details call per page view, deduplicated under Strict Mode, with no server-side metadata fetch. Invalid IDs make no call. Only the first photo loads; E2E counts exactly 1 photo request until "Show more" |
| No unofficial tile service used with Google content | ✅ | Google content only ever appears on Google's own map (Maps JavaScript API). There is no other map library or basemap |
| Live details with real data | ✅ | `pnpm smoke:live`: details billed as "Place Details Enterprise + Atmosphere", 5 reviews (all with authors), 19 amenity answers. The real `/cafes/…` page rendered in headless Chromium with attribution, 1 credited photo (800×1067 loaded through the proxy), 5 reviews, today's hours ("Friday", correct for Phnom Penh), 9 confirmed amenities, an encoded directions link, and no horizontal overflow at 390 px |
| Live map rendering | ✅ | Verified with your referrer-restricted browser key in headless Chromium at 1440 px. 20 numbered markers plus the search-centre pin. Clicking marker 3 highlighted, scrolled to and focused the matching card, and the selected pin rendered dark and enlarged. Google's attribution is present (logo link, "Map data ©2026", Terms, Keyboard shortcuts). No console errors |

| Command | Result |
|---|---|
| `pnpm lint`, `pnpm typecheck` | Pass |
| `pnpm test` | 32 files, 386 tests passed |
| `pnpm build` | Pass (`/cafes/[placeId]` partially prerendered) |
| `pnpm test:e2e` | 73 passed, 3 skipped (viewport-specific tests on the other project) |
| `pnpm check:secrets` | Pass (334 build files) |

### Decisions and deviations

- **Reviews were requested, which puts details at the Atmosphere tier.** Amenities were added at no extra cost, as genuine Google evidence. They are shown on details pages only, and don't feed ranking, because search stays at Enterprise.
- **Wi-Fi and quietness are still unverifiable.** Google has no such fields. That stays a job for M6 community reports.
- **Cards** now offer Details, Directions and Show on map. "Open in Google Maps" moved to the details page, alongside the per-review Google Maps links.
- **The details page doesn't fetch on the server**, to avoid a second billable call for page metadata, so its title stays generic.
- `DEMO_MAP_ID` is used when no Map ID is configured. Create a real Map ID for production.
- `scripts/live-smoke.mjs` was outdated after M3 (it read the old flat result shape). It's fixed and now also reports reviews and amenities.

### Remaining risks and follow-ups

- Verify the live map with a real browser key, then add a Content-Security-Policy for Maps origins (M8).
- Upgrade the "Google Maps" text attribution to the official logo where space allows (M8).
- Each details view costs one Atmosphere-tier call. Watch `placeDetails` volume in the `places_api_call` logs.

## M3 — Ranking and filters

### Delivered

- **Recommendation engine** in `lib/recommendation/`, pure and deterministic. See [recommendation-scoring.md](recommendation-scoring.md).
  - `config.ts`: configurable, Zod-validated weights and thresholds. Defaults: rating 25, distance 25, open now 10, atmosphere 15, budget 10, Wi-Fi/quiet 15.
  - `factors.ts`: one assessment per factor.
    - Rating uses Bayesian shrinkage (prior 4.3, 30 virtual reviews).
    - Distance is linear within the radius.
    - Open now treats temporary closure as overriding `openNow`.
    - Budget uses Google price level as a hedged soft signal.
    - Atmosphere, Wi-Fi and quiet use explicit evidence only.
  - `score.ts`: `scoreCafe`, `rankCafes`, `buildMatchReasons`.
    - Unknown factors count as neutral (0.5).
    - Coverage leads to confidence. The percentage is hidden when confidence is low.
    - Order: score, then distance, then place ID.
  - `relaxation.ts`: one-click empty-state suggestions, offered only where they can help.
- **API**: `results` are now ranked `Recommendation`s carrying score, `matchPercent`, confidence, coverage, factor breakdown, reasons, cautions and unverified preferences. The scoring config is injectable in the handler.
- **UI**:
  - A match badge ("74% match · High confidence", or "Limited data") and a "Best match" label.
  - "Why it matches" (✓), "Things to know" (⚠) and "Not verified for this cafe".
  - A "How this match is calculated" table.
  - A ranking note in the results header.
  - Relaxation buttons in the empty state.
- Purpose and budget labels moved to `lib/discovery/options.ts`, and the nearby response schema to `lib/discovery/response-schema.ts` (this avoids a circular import). The superseded `orderByDistance` and the client-side `unverifiedPreferences` were removed.

### Acceptance verification (2026-10-16)

| Criterion | Evidence |
|---|---|
| Pure scoring tests cover missing and contradictory fields and ties | `score.test.ts` (44 tests). Covers missing rating, distance, hours and price; zero-review ratings; temporarily closed but `openNow: true`; exact ties broken by distance and then place ID, independent of input order; no NaN with no data; custom weights; config validation |
| All match explanations are backed by evidence | Each reason is produced only by the factor that read its field. The invariant test over 2,000 seeded random cafes and 3 requests found no reason citing a missing field. The E2E test checks that Wi-Fi is never in "Why it matches" |
| No fake Wi-Fi, quiet or price claims | Wi-Fi, quiet and atmosphere score only with explicit evidence (none exists yet) and are otherwise listed as "not verified". Budget text always says "price level suggests…" and "not exact menu prices", and never quotes a dollar amount (tested) |
| Live data sanity check | One live search (3 km, work, under $5, Wi-Fi): highly rated and close cafes ranked first, percentages ranged 44–71%, confidence was medium (Wi-Fi unverified), and the reasons cited only rating, distance and opening status |

| Command | Result |
|---|---|
| `pnpm lint`, `pnpm typecheck` | Pass |
| `pnpm test` | 28 files, 339 tests passed |
| `pnpm build` | Pass |
| `pnpm test:e2e` | 57 passed, 1 skipped (mobile-only test on the desktop project), including axe scans of the new card UI |
| `pnpm check:secrets` | Pass |

### Decisions and deviations

- **Match percentages.** The request asked for them. CLAUDE.md warns against overprecise matches. The resolution: show whole numbers only, always with a confidence label; show "Limited data" when evidence is thin; and count unverifiable preferences as neutral, so the score can't reach 100% while they're unknown.
- **Added an open-now factor (10)** to the CLAUDE.md §7.2 weights and reduced purpose (20 → 15) and budget (15 → 10) to keep the total at 100.
- **Price level is used as soft budget evidence**, carefully worded, and never as a filter.
- The weights are configured in code (`DEFAULT_SCORING_CONFIG`) and injectable per handler, not through environment variables. Tuning needs a review and tests, not a runtime switch.

### Remaining risks and follow-ups

- The weights and rating prior are uncalibrated hypotheses. Calibrate them with explicit user feedback (later milestone).
- Atmosphere and amenities stay unknown until M6 community evidence arrives. Until then confidence tops out at "medium" whenever Wi-Fi or quiet is requested.
- The rating prior (4.3) is tuned to Phnom Penh. Revisit it per city.

## M2 — Google Places live provider

### Delivered

- **`lib/google/`** (server only)
  - A Places API (New) client for Nearby Search, Place Details and photo media.
  - The key goes only in the `X-Goog-Api-Key` header. Field masks are explicit and pinned.
  - Each attempt times out after 5 s. There is one retry, for 5xx and network errors only.
  - Errors are classified as auth, quota, not found, bad request, unavailable, timeout or invalid response. Key problems that Google reports as `400 API_KEY_INVALID` count as auth.
  - Each call logs its endpoint, SKU, outcome and latency, with no key and no coordinates.
- **`GooglePlacesProvider`**
  - Requests `includedTypes: ["cafe", "coffee_shop"]`, 20 results at most, with a bounded radius.
  - Maps Google responses to the DTO explicitly: missing fields stay unknown, and `openNow` is never coerced.
  - Validates each place on its own, de-duplicates by ID, and allowlists URLs.
  - Collects third-party attributions.
  - Raises vendor errors as a provider-neutral unavailable error.
- **Provider switching:** `PLACES_PROVIDER=fixture|google`. Fixture mode is still the default and needs no keys.
- **New endpoints**
  - `GET /api/places/[placeId]`: rating, hours (`weekdayDescriptions`), website, phone, and up to 5 photos with author credits.
  - `GET /api/places/photo`: a validated proxy that redirects to the image, so the key stays on the server and only Google image hosts are allowed. Nothing is cached.
- **Abuse and cost protection**
  - Per-client limits: 10 searches, 30 details and 60 photos per minute.
  - A per-instance global cap of 120 per minute.
  - `429` responses with `Retry-After`.
  - Client keys are hashed IPs, used only when `TRUST_PROXY=true`.
- **UI**
  - "Google Maps" attribution in Roboto 400 with `translate="no"`, plus any third-party providers.
  - "Open in Google Maps" links on cards.
  - "Hours can change" caveat. The existing loading, error and empty states cover the live provider.
- **Tooling**
  - `pnpm check:secrets` builds with canary secrets and scans the output for leaks.
  - `pnpm smoke:live` is a manual check of a live server.
- **Docs:** [google-maps-compliance.md](google-maps-compliance.md) (SKUs, masks, caching and attribution decisions), [deployment.md](deployment.md) (keys, quotas, budgets, kill switch, monitoring), and updated API contracts.

### Acceptance verification (2026-10-16)

| Criterion | Status | Evidence |
|---|---|---|
| With configured keys, live search returns genuine cafe info | ✅ | `pnpm smoke:live` against a production build with a real key returned 20 real cafes near Independence Monument, each with a rating, review count, open status and Maps link. Details returned hours, website and 5 photos with author credits. The photo endpoint redirected to `lh3.googleusercontent.com`. There was one `places_api_call` log line per call. Field coverage in that sample: rating, open status, business status and Maps link 20/20, price level 17/20. An earlier run with a deliberately invalid key confirmed that key errors become a safe 503 with an `auth` log entry |
| Fixture mode still works without keys | ✅ | All E2E tests run in fixture mode: 49 passed, 1 mobile-only skip |
| Tests verify request shapes and no leakage | ✅ | Pinned field masks. Exact URL, method, headers and body. The key never appears in URLs, errors or logs. The secret scan of 286 build files found no canaries |
| Policy notes documented | ✅ | [google-maps-compliance.md](google-maps-compliance.md) |
| Controlled errors | ✅ | 400, 403, 404, 429, 5xx, timeout and invalid-response paths are unit tested. Routes return safe 404, 429 and 503 bodies |
| Quota and rate protections | ✅ | Rate-limit unit and route tests. Quotas and budgets are documented for Google Cloud |

| Command | Result |
|---|---|
| `pnpm lint`, `pnpm typecheck` | Pass |
| `pnpm test` | 26 files, 285 tests passed |
| `pnpm build` | Pass |
| `pnpm test:e2e` | 49 passed, 1 skipped |
| `pnpm check:secrets` | Pass |

### Decisions and deviations

- **The details and photo endpoints are built, but they have no UI yet.** The details page, photo display with author credits, map and directions are M4 (CLAUDE.md §16). Building them now would front-load M4.
- **Enterprise SKU for search.** The rating and open-now filters need Enterprise fields. A cheaper Pro-only mask is documented as an option.
- **Text attribution "Google Maps" rather than the logo.** The policy allows text where space is limited. Switching to the official logo asset is a pre-launch follow-up.
- **No photos in search results**, to avoid up to 20 photo charges per search.
- **Opening hours are taken as Google's `weekdayDescriptions` text.** Full timezone-aware formatting arrives with the details page in M4.

### Remaining risks and follow-ups

- The live behaviour is unverified until a key is configured.
- Rate limits are in memory, per instance. On serverless, Google Cloud quotas are the real ceiling. Consider a shared store in M8.
- `TRUST_PROXY` must be set correctly in production, otherwise every user shares one bucket.
- `PLACES_PROVIDER` is baked into the prerendered footer, so a rebuild is needed after switching.

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
