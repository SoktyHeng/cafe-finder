# Architecture

## Optional conversational discovery (M7)

The intent boundary supports OpenAI Responses, NVIDIA NIM Chat Completions (`openai/gpt-oss-20b`), and the scripted fixture adapter. Both live adapters use the shared instruction contract in `lib/ai/instructions.ts` and return the same strict `SearchIntent`. NVIDIA uses its own server-only credential and fixed endpoint, JSON Schema, 2,048-token cap, 30-second timeout and per-process daily attempt allowance. No reasoning text is displayed, no tools are executed, and the result/ranking pipeline is identical for every parser. The UI identifies the actual receiving provider.

`/assistant` is a guest-accessible page behind the server `ENABLE_AI` flag. With the flag off, it explains how to use regular discovery and the navigation link is hidden. `features/assistant/search-assistant.tsx` retains at most six previous user turns in page memory; no conversation database or browser storage is used. It sends one request per explicit submit, preserves settings on failure, and offers `/discover` with the same structured settings.

`POST /api/assistant` → same-origin check → client/global AI guard → bounded JSON input → verified saved preferences (first turn only, optional) → `IntentProvider` → strict output validation → pure `resolveIntent` → existing Nearby handler → existing Places guards/provider → approved community aggregation → deterministic ranking → existing result cards/map/details.

`lib/ai/` separates the intent contract, OpenAI/NVIDIA adapters, scripted fixture adapter, pure merge/location resolution, per-process runtime and conservative budget reservation. Each live AI request contains only search text/history and categorical preferences, never selected coordinates, account identifiers, cafe records, Google reviews, or API keys in instructions. No model tools, arbitrary URLs, model-selected endpoints, generated venue descriptions, or generated scores exist. Secrets appear only in the server's authorization header. The model cannot grant access or bypass the downstream radius, schema, Places rate limits, or ranking rules.

Personalization uses existing, verified M5 saved defaults; explicit current preferences override them. Follow-ups send the previous interpreted preferences as an editable draft. They confer no identity or database access. Cafe explanations remain the deterministic M3/M6 reasons with provenance and uncertainty. Unsupported locations require clarification; “near me” requires a separately supplied device location, obtained only through the existing permission button. Unknown Wi-Fi/quietness and exact dollar prices are never promised.

The OpenAI adapter fixes the model identifier to `gpt-5.6-luna`, uses strict JSON Schema, reasoning effort `none`, `store:false`, a 10-second timeout, 512 output tokens and no automatic retries. The official model page currently lists only this identifier, not a dated snapshot; rerun the acceptance corpus when provider behavior changes. `AI_PROVIDER=fixture` is a small documented scripted corpus and requires fixture Places. Production never silently switches to fictional results when the selected AI provider fails.

The target architecture is described in CLAUDE.md §4. This file records **what is actually implemented** (through M7, including live NVIDIA and Google Places browser verification).

```text
Browser
 ├─ /            HomePage (server) → HomeDiscovery (client form) ── submit ──▶ /discover?…
 └─ /discover    DiscoveryView (client, inside Suspense)
                   ├─ URL search params ⇄ form values      features/discovery/url-state.ts
                   ├─ useNearbySearch (one call per submitted search)
                   │     └─ POST /api/places/nearby
                   └─ ResultsPanel → ResultsWithMap ─┬─ CafeCard (Details · Directions · Show on map)
                                                     └─ CafeMap (lazy; Maps JS API, browser key)
 /login, /favorites, /account  (auth: Supabase via @supabase/ssr; proxy.ts refreshes sessions)
 /cafes/[placeId] CafeDetailsView (client, inside Suspense)
                   └─ usePlaceDetails → GET /api/places/[placeId] → photos (/api/places/photo), hours, amenities, reviews
Server
 └─ /api/places/nearby  handler.ts
       ├─ Zod: discoveryRequestSchema               lib/discovery/
       ├─ guards: per-client + global rate limits    lib/security/
       ├─ getPlacesProvider(env) → PlacesProvider   lib/places/
       │     ├─ FixturePlacesProvider (fictional demo cafes)
       │     └─ GooglePlacesProvider → normalize ← GooglePlacesClient (lib/google/, server only)
       │                                              └─ places.googleapis.com (key in header)
       ├─ loadCommunitySummaries (approved member reports, 2 s timeout)          lib/community/
       ├─ applyHardFilters → withDistance → rankCafes (weighted, explainable)   lib/recommendation/
       └─ apiError (safe error contract)            lib/security/
```

## Modules

| Path | Responsibility |
|---|---|
| `lib/config/` | Validated environment (M0) |
| `lib/places/schemas.ts` | `CafePlace` DTO and the response contract, as Zod schemas. Types are inferred from them |
| `lib/places/provider.ts` | `PlacesProvider` interface, the result cap, and `PlacesProviderUnavailableError` |
| `lib/places/fixture-provider.ts`, `fixture-data.ts` | Offline provider backed by **fictional** cafes |
| `lib/places/get-provider.ts` | Provider selection from `PLACES_PROVIDER` (server only) |
| `lib/places/google-provider.ts`, `google-normalize.ts` | Live provider. Explicit Google → DTO mapping, de-duplication, attributions. Vendor errors become `PlacesProviderUnavailableError` |
| `lib/google/` | Low-level Places API (New) client (timeouts, bounded retry, usage logs), pinned field masks, error classification, tolerant response schemas |
| `lib/security/rate-limit.ts`, `request-guard.ts`, `guards.ts` | In-memory fixed-window limits and privacy-preserving client keys |
| `lib/security/safe-url.ts` | Allowlists for Google Maps links, photo redirect hosts and websites |
| `lib/observability/log.ts` | Structured JSON logs with no sensitive fields |
| `app/api/places/[placeId]`, `app/api/places/photo` | Details and photo-proxy endpoints (M2, used by the M4 UI) |
| `lib/discovery/request-schema.ts` | Discovery request schema and enums, shared by client and server |
| `lib/recommendation/filters.ts` | Pure hard filters, de-duplication and distance enrichment |
| `lib/recommendation/config.ts`, `factors.ts`, `score.ts`, `schemas.ts` | Configurable weighted scoring, evidence-backed explanations, confidence and match percentages (see [recommendation-scoring.md](recommendation-scoring.md)) |
| `lib/recommendation/relaxation.ts` | Empty-state "widen your search" suggestions |
| `lib/discovery/options.ts`, `response-schema.ts` | Purpose and budget labels shared by the UI and the scorer. The nearby response contract |
| `lib/geo/distance.ts` | Haversine distance and coordinate rounding |
| `lib/locations/cities.ts` | Manually selectable areas per city (approximate centres). Add cities here |
| `lib/security/api-error.ts` | Error contract |
| `features/discovery/` | Form state, URL state, API client, hooks (`useGeolocation`, `useNearbySearch`) and components |
| `features/cafes/` | Cafe card, match explanation, map (`cafe-map.tsx`, `map-unavailable.tsx`), details page (`cafe-details-view.tsx`, `photo-gallery.tsx`, `reviews-list.tsx`, `amenities-list.tsx`, `opening-hours-list.tsx`), formatting |
| `features/discovery/components/results-with-map.tsx` | List and map layout, List/Map toggle, two-way selection |
| `lib/google/maps-urls.ts` | Official, key-free Google Maps directions links |
| `lib/supabase/` | `server.ts` (request-scoped client, `getVerifiedUser` via `getClaims`), `browser.ts` (UI state only), `proxy.ts` (session refresh plus optimistic redirects), hand-written `database.types.ts` |
| `proxy.ts` | Next.js 16 Proxy (formerly middleware): runs `updateSession` on every non-static request |
| `lib/user-data/` | Zod contracts, the `UserDataStore` interface, the RLS-scoped Supabase store, route handlers (CSRF, auth, rate limit), and favorites summaries (Place Details Pro) |
| `features/auth/` | Server actions (sign-in, sign-up, Google), `AuthProvider` (UI state), login and account views |
| `features/favorites/` | `SavedPlacesProvider` (optimistic favorite and visited toggles), Save and Visited buttons, favorites view |
| `lib/community/` | M6 member content. Zod contracts, the trust model and aggregation (`aggregate.ts`), store interfaces and the Supabase store (RPCs for public reads, RLS-scoped writes), route handlers, and `context.ts` (session client for members, the anonymous client for guests) |
| `lib/http/route-helpers.ts` | Shared route plumbing: same-origin check, JSON body limit, validation, `private, no-store` responses |
| `features/community/` | Data hook and mutations, card badges, the details-page section (summaries, report form, own review, member reviews with vote and flag), moderation view |
| `lib/http/request-api.ts`, `hooks/use-keyed-request.ts` | Typed API calls that never throw, and deduplicated one-call-per-action requests (shared by search and details) |

## Key decisions

- **Explicit searches only.** Form edits never fetch. Submitting writes the search to the URL, and `useNearbySearch` keys its single request on the URL query. An in-flight promise map deduplicates React Strict Mode's double effects. Responses for superseded searches are ignored. Opening or reloading a results URL re-runs that search once. An invalid URL never searches.
- **Location privacy.** Geolocation is requested only on click, with no high-accuracy mode, no watching, and positions up to 5 minutes old accepted. Device coordinates are rounded to 3 decimals (about 110 m) before they reach the URL or the API. Manual areas are referenced by ID. The server does not log coordinates.
- **Provider boundary.** The UI, route handlers and filters depend only on the normalized DTOs. Google response shapes stay in `lib/google/` and the Google provider. Providers expose `searchNearby`, `getPlaceDetails` and `getPhotoUrl`.
- **Live data, no caching.** Google content is fetched per request and returned with `no-store`. See [google-maps-compliance.md](google-maps-compliance.md).
- **Error boundaries.** `app/error.tsx` and `app/global-error.tsx` (M0) handle render errors. Search failures are handled in the UI as states.
- **Rendering.** `/` and `/discover` are prerendered shells. `/discover` and `/cafes/[placeId]` read URL state on the client inside `<Suspense>`, as Cache Components require. The details page doesn't fetch on the server, so there's no second billable details call for metadata.
- **Map lifecycle.** The Maps JavaScript API loads only when a map is first shown: always on wide screens, after "Map" is chosen on narrow ones. The map is then kept mounted. Selection changes only pan the map and restyle markers. A new search remounts the view, which resets selection and framing. Without a key, or on a load or auth failure, the map is replaced by a fallback and the list keeps working.
- **Auth boundary.** The browser reads only sign-in *state*, for buttons. Every protected page and API route verifies the JWT on the server (`getClaims`) and queries Supabase *as the user*, so RLS is the final gate. The proxy redirects signed-out visitors from `/favorites` and `/account` as an optimistic check; the pages check again.
- **Guest-first.** Search, map and details never need an account. Without Supabase configured, all sign-in UI is hidden.
- **Community data is separate evidence.** Member reports never alter Google fields. They're aggregated into anonymized summaries and passed to the scorer as separately labelled `CafeEvidence`. Only approved content is read. Status is controlled by database triggers and moderators, never by clients. Community failures never break search or details.
- **Saved data stores IDs only.** Favorites and visits store Google place IDs and user-authored notes. Names and addresses are refetched per view with a Pro-tier summary mask: at most 50 per page, 5 at a time, 10 page loads per user per minute.
- **Key separation.** The public browser key (Maps JavaScript API) and the server key (Places) are distinct. `instrumentation.ts` refuses to start if they're equal.

## Deviations from CLAUDE.md

- The DTO fields `googleRating` and `googleRatingCount` are named `rating` and `ratingCount`, because fixture data is not Google data. The source comes from `dataSource` and is always shown next to the rating.
- `features/discovery/` also contains `hooks/` and non-component modules (`form-state.ts`, `url-state.ts`, `api-client.ts`).
- The Supabase browser key is read from `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase's current name). CLAUDE.md's `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a fallback.
- Shared modules `lib/discovery/`, `lib/geo/` and `lib/locations/` were added. They don't fit the existing boundaries and need no vendor access.
- The route handler logic lives in `handler.ts` next to `route.ts`, so it can be tested with injected dependencies. Next.js route files may only export HTTP methods and config.
