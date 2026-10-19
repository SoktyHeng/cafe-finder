# API contracts

## Conversational assistant (M7)

`POST /api/assistant` accepts JSON from the same origin only. Body limit: **12,000 UTF-8 bytes**, enforced while streaming even without Content-Length. Strict input fields:

- `message`: trimmed nonempty text, at most 1,000 characters.
- `history`: up to six previous user search strings, each at most 1,000 characters. Arbitrary chat roles/system messages are not accepted.
- `preferences` (optional): the existing strict M5 preferences contract. Omitted on the first turn to use verified saved defaults, otherwise explicit conversation draft values. No user ID is accepted.
- `location`: `null`, `{kind:"area",areaId:<supported area ID>}`, or `{kind:"device",latitude,longitude}`. Device positions are rounded again on the server. The parser cannot supply coordinates.

Example: `{"message":"Find a quiet cafe with Wi-Fi under $5 in BKK1.","history":[],"location":null}`.

Success returns `{status,message,provider,preferences,location,locationLabel,filters,notices,results}`. `status` is `ready`, `clarify` or `unsupported`; `provider` is `openai`, `nvidia` or `fixture`. `filters` is the validated DiscoveryRequest or null; `results` is the existing NearbySearchResponse or null. The reply message and notices are application-owned text. Cafe data and match reasons are only from the downstream recommendation pipeline. “Clarify” and “unsupported” make no Places request.

Errors use the existing error contract: 400 invalid/oversized input; 403 absent/foreign Origin; 429 client/global throttling or exhausted daily AI allowance (Retry-After); 503 disabled/unavailable/refused/invalid AI responses. Downstream Places failures and throttling retain their existing status/code. Responses are private/no-store; raw model responses, upstream errors and credentials never reach the client. Normal discovery remains available independently of AI.

All routes return JSON. Errors always use the shape below and never include vendor payloads, keys, stack traces or submitted values.

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid search parameters: latitude, purpose." } }
```

| Code | Status |
|---|---|
| `VALIDATION_ERROR` | 400 |
| `AUTH_REQUIRED` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `RATE_LIMITED` | 429 (with `Retry-After`) |
| `INTERNAL_ERROR` | 500 |
| `UPSTREAM_UNAVAILABLE` | 503 |

Source: [src/lib/security/api-error.ts](../src/lib/security/api-error.ts). Every response sets `Cache-Control: no-store`, because Google content must not be cached.

## `POST /api/places/nearby` (M1, live provider M2, ranking M3)

Implementation: [src/app/api/places/nearby/handler.ts](../src/app/api/places/nearby/handler.ts).

### Request

- `Content-Type: application/json` is required. This forces a CORS preflight for cross-site callers.
- The body may be at most 2 KB.
- The body is validated with [discoveryRequestSchema](../src/lib/discovery/request-schema.ts). It is a strict object, so unknown keys are rejected, and nothing is coerced: strings are never turned into numbers or booleans.

| Field | Type | Rules |
|---|---|---|
| `latitude` | number | -90 to 90, finite |
| `longitude` | number | -180 to 180, finite |
| `radiusMeters` | integer | 1000–15000, and at most `MAX_SEARCH_RADIUS_METERS` |
| `purpose` | enum | `work`, `relax`, `friends`, `date` |
| `minRating` | number? | 0–5 |
| `openNowOnly` | boolean? | |
| `budget` | enum? | `any`, `under_5`, `5_to_10`, `over_10` (USD preference, not verified) |
| `preferQuiet` | boolean? | Not verifiable yet. Never filters results |
| `preferWifi` | boolean? | Not verifiable yet. Never filters results |

### Response 200

```json
{
  "results": [
    {
      "cafe": {
        "placeId": "fixture-001",
        "name": "Lantern Bean Demo Cafe",
        "rating": 4.6,
        "ratingCount": 412,
        "openNow": true,
        "distanceMeters": 268,
        "dataSource": "fixture"
      },
      "score": 0.7432,
      "matchPercent": 74,
      "confidence": "high",
      "coverage": 0.8,
      "factors": [
        { "factor": "rating", "weight": 25, "score": 0.6124 },
        { "factor": "distance", "weight": 25, "score": 0.9107 },
        { "factor": "openNow", "weight": 10, "score": 1 },
        { "factor": "atmosphere", "weight": 15, "score": null }
      ],
      "knownMatchReasons": ["Well rated in demo data", "Very close to you", "Open now (according to demo data)"],
      "cautions": [],
      "unverifiedPreferences": ["Good for work or study"]
    }
  ],
  "searchedAt": "2026-10-16T00:00:00.000Z",
  "source": "fixture",
  "coverageNote": "Results are a subset of nearby cafes, not an exhaustive list.",
  "excluded": { "belowMinRating": 0, "closedNow": 0, "permanentlyClosed": 1 },
  "attributions": []
}
```

- `source` is `google` or `fixture`. `searchedAt` above is illustrative.
- `attributions` lists third-party data providers that must be credited next to "Google Maps" (see [google-maps-compliance.md](google-maps-compliance.md)).
- `results` are ranked `Recommendation`s, best first ([src/lib/recommendation/schemas.ts](../src/lib/recommendation/schemas.ts)). The scoring is described in [recommendation-scoring.md](recommendation-scoring.md). `matchPercent` is `null` when confidence is low. A factor `score` of `null` means unknown, which counts as neutral. The values in the example above are illustrative.
- `cafe` conforms to `cafePlaceSchema` in [src/lib/places/schemas.ts](../src/lib/places/schemas.ts). Every Google-derived field is optional, and a missing field means "unknown". `googleMapsUri` is an official link whose host is allowlisted.

### Hard filters and unknown data (M1)

Implementation: [src/lib/recommendation/filters.ts](../src/lib/recommendation/filters.ts). Places are de-duplicated by place ID first.

| Rule | Removed | Kept and labelled |
|---|---|---|
| Always | `businessStatus = closed_permanently` | Temporarily closed cafes, shown with a badge |
| `minRating` | `rating < minRating` (inclusive threshold) | Unrated cafes ("No rating yet") |
| `openNowOnly` | `openNow === false` | Unknown hours ("Opening hours unknown") |
| Budget, Wi-Fi, quiet, purpose | Never | Shown on every card as "Not verified" |

After filtering, results are ranked by score, then distance, then place ID (M3).

### Errors

- `400 VALIDATION_ERROR`: wrong content type, a body over 2 KB, malformed JSON, schema violations (the message lists field names only), or a radius above the configured maximum.
- `429 RATE_LIMITED`: the per-client or global limit was reached. Only valid requests count toward the limit.
- `503 UPSTREAM_UNAVAILABLE`: Google is down, timed out, over quota, rejected the key, or returned an unexpected body. The public message is generic, and the reason is only logged.
- `500 INTERNAL_ERROR`: an unexpected failure, logged as `{"event":"nearby_search_failed","errorName":…}` with no coordinates.

## `GET /api/places/[placeId]` (M2, reviews and amenities M4)

Implementation: [src/app/api/places/[placeId]/handler.ts](../src/app/api/places/%5BplaceId%5D/handler.ts). Details are fetched on demand with the details field mask, once per opened `/cafes/[placeId]` page.

- `placeId` must contain only letters, digits, `_` and `-`, up to 512 characters. Otherwise the response is `400`.
- `200` returns `{ place, fetchedAt, source, attributions }`. `place` is a `CafePlace` plus:
  - optional `weekdayDescriptions`, the source's text in the place's local time;
  - optional `utcOffsetMinutes`;
  - optional `websiteUri`, http or https only;
  - optional `phoneNumber`;
  - required `photos`, up to 5, each `{ name, widthPx?, heightPx?, authorAttributions: [{ displayName, uri? }] }`;
  - required `reviews`, up to 5 Google reviews, each `{ authorName, authorUri?, authorPhotoUri?, rating?, relativePublishTime?, publishTime?, text?, translated, googleMapsUri? }`. Author attribution is required for display;
  - required `amenities`, Google's answers as `{ dineIn?: boolean, outdoorSeating?: boolean, wheelchairAccessibleEntrance?: boolean, acceptsCreditCards?: boolean, … }`. A missing key means Google doesn't list it. There are never Wi-Fi or noise fields.
- `404 NOT_FOUND` for unknown IDs, `429` when rate-limited, `503` for an upstream failure.
- Photo `name` values are short-lived and must not be stored. Author attributions must be displayed with each photo.

## `GET /api/places/photo?name=…&maxWidthPx=…` (M2)

Implementation: [src/app/api/places/photo/handler.ts](../src/app/api/places/photo/handler.ts).

- `name` must match `places/{id}/photos/{ref}`. `maxWidthPx` is 200, 400 (the default) or 800.
- `302` redirects to a `*.googleusercontent.com` image URL, with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. The key stays on the server, and any other redirect host is refused.
- `400` for an invalid name or width, `404` for an expired or unknown photo (refetch the details), `429` when rate-limited, `503` for an upstream failure.

## User data (M5)

All routes require a Supabase session, verified on the server with `getClaims()` (never `getSession()`), and run **as the user**, so Postgres RLS applies. Responses are `Cache-Control: private, no-store`.

| Route | Methods | Body / query | Success |
|---|---|---|---|
| `/api/favorites` | GET | | `{ favorites: [{ placeId, notes, createdAt }] }`, newest first, at most 500 |
| | POST | `{ placeId, notes? }` | 201 `{ favorite }`. Upsert: re-saving keeps notes unless given |
| | PATCH | `{ placeId, notes }` (`""` clears) | `{ favorite }`, or 404 if not a favorite |
| | DELETE | `?placeId=` | 204 |
| `/api/visits` | GET / POST `{ placeId }` / DELETE `?placeId=` | | `{ visits: [{ placeId, visitDate, createdAt }] }` / 201 / 204 |
| `/api/preferences` | GET / PUT | `{ purpose, radiusMeters, minRating (0–5, step 0.1, or null), openNowOnly, budget, preferQuiet, preferWifi }` | `{ preferences }` |
| `/api/profile` | GET / PATCH | `{ displayName }` (≤80, blank means null) | `{ profile: { displayName, email } }` |
| `/api/account` | DELETE | `{ confirm: "delete my account" }` | 204. All first-party data deleted |

Protections:
- **CSRF:** POST, PUT, PATCH and DELETE require an `Origin` header equal to the request's origin, and reject `Sec-Fetch-Site: cross-site` (403 `FORBIDDEN`). Bodies must be JSON, at most 4 KB. Schemas are strict, so a client-supplied `user_id` is rejected.
- **Rate limit:** 60 requests per minute per user (429 with `Retry-After`).

Errors:
- `401 AUTH_REQUIRED`: no valid session.
- `503 UPSTREAM_UNAVAILABLE`: Supabase isn't configured, or is unreachable.
- `400 VALIDATION_ERROR`: invalid input or the 500-row limit. Field names only, never values.
- Database errors are logged as `user_data_failed` (operation and error name only) and never returned.

## Auth routes (M5)

| Route | Purpose |
|---|---|
| `/login` | Email/password sign-in and sign-up (server actions), and "Continue with Google". `?next=` must be a same-site path; anything else falls back to `/` |
| `/auth/callback` | OAuth return: exchanges the PKCE `code` for a session, then redirects to `next`. Failure goes to `/login?error=oauth` |
| `/auth/confirm` | Email links: `verifyOtp({ token_hash, type })`, then redirects to `next`. Failure goes to `/login?error=confirm` |

## Community (M6)

Member contributions about a place: amenity reports, one review per member, helpful votes and flags. This is **first-party data, kept separate from Google content**. Reads are public; writes need a session. Every response is `Cache-Control: private, no-store`.

| Route | Methods | Body / query | Success |
|---|---|---|---|
| `/api/community/[placeId]` | GET | | `{ placeId, amenities: AmenitySummary[], reviews: CommunityReview[], mine }`. `mine` is `null` for guests, otherwise `{ reports, review, votes, flaggedReviewIds }` |
| `/api/community/[placeId]/amenities` | PUT | `{ answers: [{ amenity, value }], observedOn: "YYYY-MM-DD" }`, with 1–5 answers and no amenity repeated | 204. Upsert: one answer per member, place and amenity |
| | DELETE | `?amenity=` | 204 |
| `/api/community/[placeId]/review` | PUT | `{ rating: 1–5, body: 20–1000 characters }` | `{ status: "approved" }` or `{ status: "pending" }`. Pending means a moderator checks it first |
| | DELETE | | 204 |
| `/api/community/reviews/[reviewId]/vote` | PUT | `{ helpful: boolean }` | 204. Not on your own review |
| | DELETE | | 204 |
| `/api/community/flags` | POST | `{ targetType: "amenity_report" or "review", targetId, reason }`. Reasons: spam, offensive, incorrect, personal_info, other | 201 `{ flagged: true }`. Once per member per item, never your own |
| `/api/moderation` | GET | | `{ items }`: pending and flagged content. Moderators only |
| | POST | `{ targetType, targetId, decision: "approved" or "rejected" }` | 204. Audited |

Amenities and their values:

| Amenity | Values |
|---|---|
| `wifi` | yes, no |
| `outlets` | many, some, none |
| `noise` | quiet, moderate, loud |
| `seating` | comfortable, ok, uncomfortable |
| `laptop_friendly` | yes, no |

`observedOn` must fall within the last 365 days.

- **Summaries, not rows.** `amenities` are aggregates: consensus, agreement, report and confirmed-visit counts, latest date, `sufficient` and `conflicted`. Individual reports are never returned. Reviews never include user IDs or names, only `isOwn` and `confirmedVisit`.
- **Only approved content** appears in reads or affects ranking.
- **Protections** match the user-data routes: a CSRF check on mutations, strict schemas, and JSON bodies of at most 4 KB.
- **Rate limits:** 60 reads per minute per member or client, and 30 writes per minute per member. Postgres adds daily and total caps per member (see [data-model.md](data-model.md#community-m6)).

Errors:
- `401 AUTH_REQUIRED`: a write without a session.
- `503 UPSTREAM_UNAVAILABLE`: Supabase isn't configured or can't be reached.
- `429 RATE_LIMITED`: the request rate or the daily contribution cap.
- `403 FORBIDDEN`: voting on or flagging your own content, content that isn't visible, or a non-moderator calling `/api/moderation`.
- `400 VALIDATION_ERROR`: invalid input, a duplicate flag, or a value the database rejects.
- `404 NOT_FOUND`: the item no longer exists.

`POST /api/places/nearby` results gain an optional `community: AmenitySummary[]` per cafe (see [recommendation-scoring.md](recommendation-scoring.md#community-evidence-m6)). If the community lookup fails or takes more than 2 seconds, search continues without it.
