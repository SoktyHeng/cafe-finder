# Architecture

The target architecture is described in CLAUDE.md §4. This file records **what is actually implemented** (through M3).

```text
Browser
 ├─ /            HomePage (server) → HomeDiscovery (client form) ── submit ──▶ /discover?…
 └─ /discover    DiscoveryView (client, inside Suspense)
                   ├─ URL search params ⇄ form values      features/discovery/url-state.ts
                   ├─ useNearbySearch (one call per submitted search)
                   │     └─ POST /api/places/nearby
                   └─ ResultsPanel → CafeCard
Server
 └─ /api/places/nearby  handler.ts
       ├─ Zod: discoveryRequestSchema               lib/discovery/
       ├─ guards: per-client + global rate limits    lib/security/
       ├─ getPlacesProvider(env) → PlacesProvider   lib/places/
       │     ├─ FixturePlacesProvider (fictional demo cafes)
       │     └─ GooglePlacesProvider → normalize ← GooglePlacesClient (lib/google/, server only)
       │                                              └─ places.googleapis.com (key in header)
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
| `features/cafes/` | Cafe card, match badge and explanation, display formatting |

## Key decisions

- **Explicit searches only.** Form edits never fetch. Submitting writes the search to the URL, and `useNearbySearch` keys its single request on the URL query. An in-flight promise map deduplicates React Strict Mode's double effects. Responses for superseded searches are ignored. Opening or reloading a results URL re-runs that search once. An invalid URL never searches.
- **Location privacy.** Geolocation is requested only on click, with no high-accuracy mode, no watching, and positions up to 5 minutes old accepted. Device coordinates are rounded to 3 decimals (about 110 m) before they reach the URL or the API. Manual areas are referenced by ID. The server does not log coordinates.
- **Provider boundary.** The UI, route handlers and filters depend only on the normalized DTOs. Google response shapes stay in `lib/google/` and the Google provider. Providers expose `searchNearby`, `getPlaceDetails` and `getPhotoUrl`.
- **Live data, no caching.** Google content is fetched per request and returned with `no-store`. See [google-maps-compliance.md](google-maps-compliance.md).
- **Error boundaries.** `app/error.tsx` and `app/global-error.tsx` (M0) handle render errors. Search failures are handled in the UI as states.
- **Rendering.** `/` and `/discover` are prerendered shells. `/discover` reads search params on the client inside `<Suspense>`, as Cache Components require.

## Deviations from CLAUDE.md

- The DTO fields `googleRating` and `googleRatingCount` are named `rating` and `ratingCount`, because fixture data is not Google data. The source comes from `dataSource` and is always shown next to the rating.
- `features/discovery/` also contains `hooks/` and non-component modules (`form-state.ts`, `url-state.ts`, `api-client.ts`).
- Shared modules `lib/discovery/`, `lib/geo/` and `lib/locations/` were added. They don't fit the existing boundaries and need no vendor access.
- The route handler logic lives in `handler.ts` next to `route.ts`, so it can be tested with injected dependencies. Next.js route files may only export HTTP methods and config.
