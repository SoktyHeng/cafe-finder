# API contracts

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
| `RATE_LIMITED` | 429 |
| `INTERNAL_ERROR` | 500 |
| `UPSTREAM_UNAVAILABLE` | 503 |

Source: [src/lib/security/api-error.ts](../src/lib/security/api-error.ts).

## `POST /api/places/nearby` (M1)

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
      "placeId": "fixture-001",
      "name": "Lantern Bean Demo Cafe",
      "latitude": 11.5551,
      "longitude": 104.9262,
      "rating": 4.6,
      "ratingCount": 412,
      "openNow": true,
      "distanceMeters": 268,
      "dataSource": "fixture"
    }
  ],
  "searchedAt": "2026-10-16T00:00:00.000Z",
  "source": "fixture",
  "coverageNote": "Results are a subset of nearby cafes, not an exhaustive list.",
  "excluded": { "belowMinRating": 0, "closedNow": 0, "permanentlyClosed": 1 }
}
```

`searchedAt` above is illustrative. Each result conforms to `cafePlaceSchema` in [src/lib/places/schemas.ts](../src/lib/places/schemas.ts). Every Google-derived field is optional, and a missing field means "unknown".

### Hard filters and unknown data (M1)

Implementation: [src/lib/recommendation/filters.ts](../src/lib/recommendation/filters.ts).

| Rule | Removed | Kept and labelled |
|---|---|---|
| Always | `businessStatus = closed_permanently` | Temporarily closed cafes, shown with a badge |
| `minRating` | `rating < minRating` (inclusive threshold) | Unrated cafes ("No rating yet") |
| `openNowOnly` | `openNow === false` | Unknown hours ("Opening hours unknown") |
| Budget, Wi-Fi, quiet, purpose | Never | Shown on every card as "Not verified" |

Results are currently ordered by straight-line distance, with unknown distances last and ties broken by place ID. Explainable scoring replaces this order in M3.

### Errors

- `400 VALIDATION_ERROR`: wrong content type, a body over 2 KB, malformed JSON, schema violations (the message lists field names only), or a radius above the configured maximum.
- `503 UPSTREAM_UNAVAILABLE`: the configured provider cannot serve requests. `PLACES_PROVIDER=google` returns this until M2.
- `500 INTERNAL_ERROR`: an unexpected failure. It is logged as `{"event":"nearby_search_failed","errorName":…}` with no coordinates.

Rate limiting (`429`) is added with the live provider in M2.
