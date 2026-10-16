# Google Maps Platform compliance

Last reviewed: **2026-10-16**, against the official pages listed at the end. Re-check them before changing field masks, adding caching, adding a map, or launching.

## APIs in use (M2)

| Feature | API | Called from | Billing SKU (highest field in the mask) |
|---|---|---|---|
| Discovery search | Nearby Search (New), `POST places:searchNearby` | Server (`/api/places/nearby`) | **Nearby Search Enterprise** |
| Place details | Place Details (New), `GET places/{id}` | Server (`/api/places/[placeId]`) | **Place Details Enterprise** |
| Photos | Place Photos (New), `GET {photo}/media?skipHttpRedirect=true` | Server (`/api/places/photo`) | Place Photo, per photo requested |

No Google API is called from the browser. The details endpoint is built and tested, but no UI calls it until M4.

## Field masks

Masks are defined in [src/lib/google/field-masks.ts](../src/lib/google/field-masks.ts). The exact strings are pinned by tests, never `*`.

**Nearby Search:** `places.id, displayName, location, shortFormattedAddress, businessStatus, googleMapsUri, attributions, rating, userRatingCount, priceLevel, currentOpeningHours`

**Place Details:** `id, displayName, location, formattedAddress, businessStatus, googleMapsUri, attributions, photos, utcOffsetMinutes, rating, userRatingCount, priceLevel, currentOpeningHours, websiteUri, nationalPhoneNumber`

### Cost decision: Enterprise tier

`rating`, `userRatingCount`, `priceLevel` and `currentOpeningHours` are Enterprise fields. Requesting any one of them bills the whole request at Enterprise. Rating and open-now power the core filters (CLAUDE.md §7), so Enterprise is the floor for search.

Excluded on purpose:
- **Atmosphere fields** (`reviews`, `servesCoffee`, `goodForGroups`, `editorialSummary` and similar): they cost more, and reviews raise extra display and attribution duties.
- **`places.photos` in Nearby Search**: the field is free at Pro, but showing a photo per card would add up to 20 Place Photo calls per search.

A future option is a Pro-only "browse" mask without rating or hours. That would need product sign-off, because the rating and open-now filters would then show "unknown".

Field-mask subpaths such as `currentOpeningHours.openNow` are not documented, so the top-level `currentOpeningHours` is requested. Only `openNow` is used in search, and only `weekdayDescriptions` in details.

## Request bounds

- `includedTypes: ["cafe", "coffee_shop"]` (both are Table A types), `maxResultCount: 20`, `rankPreference: "POPULARITY"`, `languageCode: "en"`.
- The radius is validated to 1–15 km and capped by `MAX_SEARCH_RADIUS_METERS`. Google allows up to 50 km.
- Results are capped at 20 and labelled "a subset of nearby cafes, not an exhaustive list". There is no tiling or pagination.
- Searches run only on an explicit "Find My Cafe" submit. There is one request per submitted search, deduplicated under React Strict Mode.
- Each attempt times out after 5 s. There is one retry, and only for 5xx or network errors. 429, 403 and 400 are never retried.
- Rate limits: per client (search 10/min, details 30/min, photos 60/min) and a per-instance global cap of 120/min. See [deployment.md](deployment.md).

## Caching and storage

- Google content is **not cached or persisted**. Every response is fetched per request and sent with `Cache-Control: no-store`. Nothing is written to a database.
- Place IDs may be stored indefinitely (policy exemption). From M5 they will be the only stored Google data.
- Photo names are never cached ("You cannot cache a photo name"). The photo endpoint resolves a fresh name each time and redirects with `no-store`. An expired name returns 404 so the client can refetch details.
- Latitude and longitude from Google are used only within a request, for straight-line distance.

## Attribution and branding

| Requirement | Implementation |
|---|---|
| Places data without a Google map must carry Google Maps attribution. The logo is preferred, and the text "Google Maps" is acceptable where space is limited | Google-sourced results show **"Google Maps"** text at the top of the results container. It uses Roboto 400, 12px, colour `#5E5E5E` on a cream background (contrast above 4.5:1), `translate="no"`, and never wraps. Source: [google-maps-attribution.tsx](../src/components/google-maps-attribution.tsx) |
| Third-party data providers must be named alongside "Google Maps" | `places.attributions` (a Pro field) is requested, de-duplicated, and rendered as "Google Maps · Data: Provider…" with links when provided |
| Users must be able to see the source on Google Maps | Each card links to its `googleMapsUri` ("Open in Google Maps"). The link host is allowlisted |
| Photo author credit wherever a photo is shown | The details DTO carries `authorAttributions` (name and profile link) for every photo. **M4 must render these with each photo.** Thumbnails may omit them only if a larger version with credit is reachable |
| Places data on a map must use a Google Map | No map yet. M4 must use the Maps JavaScript API only |
| No Google content mixed into our own ratings | Ratings are always labelled "Google rating". Community data (M6) stays separate |

**Follow-up before production:** use the official Google Maps logo asset where space allows, which the policy prefers. The current text attribution fits the compact results header.

## Data handling

- The API key is sent only in the `X-Goog-Api-Key` header, from server-only modules (`import "server-only"`). It never appears in URLs, logs, errors or client bundles. `pnpm check:secrets` builds with canary keys and scans the output.
- Raw Google responses never reach the browser. Everything is normalized into our DTO, and unknown fields stay `undefined`.
- Logs record the endpoint, SKU, outcome, HTTP and Google status, and latency. They never record coordinates, place names, keys or response bodies.

## Official sources

- Nearby Search (New): https://developers.google.com/maps/documentation/places/web-service/nearby-search
- Place Details (New): https://developers.google.com/maps/documentation/places/web-service/place-details
- Place Photos (New): https://developers.google.com/maps/documentation/places/web-service/place-photos
- Place types: https://developers.google.com/maps/documentation/places/web-service/place-types
- Policies and attributions: https://developers.google.com/maps/documentation/places/web-service/policies
- Usage and billing: https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
