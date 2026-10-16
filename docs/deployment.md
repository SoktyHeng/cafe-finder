# Deployment and operations

This covers the M2 scope: Google Places configuration. The production checklist is completed in M8.

## Google Cloud setup

1. Create **separate projects or keys for local, staging and production**.
2. Enable **Places API (New)**. The legacy Places API is not used.
3. Create the **server key** (`GOOGLE_PLACES_SERVER_API_KEY`):
   - API restriction: **Places API (New)** only.
   - Application restriction: IP addresses where the host has stable egress IPs. Most serverless hosts, including standard Vercel, don't, so rely on the API restriction, quotas and the fact that the key never leaves the server.
   - Never prefix it with `NEXT_PUBLIC_`. Store it only in the host's secret store or `.env.local`, which is git-ignored.
4. The browser Maps key (`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`) is not used until M4. When added, restrict it by HTTP referrer and to the Maps JavaScript API only.
5. Set **quotas** under APIs & Services → Places API (New) → Quotas: requests per minute and per day for Nearby Search, Place Details and Place Photo, sized to expected traffic.
6. Set a **billing budget with alerts**, for example at 50%, 90% and 100%. Budgets alert but do not cap spending, so the quotas are the hard limit.

## Application configuration

| Variable | Default | Notes |
|---|---|---|
| `PLACES_PROVIDER` | `fixture` | `google` enables live data. Read at build time for the demo-mode footer, so **rebuild after changing it** |
| `GOOGLE_PLACES_SERVER_API_KEY` | none | Required when the provider is `google`. The server refuses to start without it |
| `DISCOVERY_RATE_LIMIT_PER_MINUTE` | 10 | Per client, searches |
| `PLACE_DETAILS_RATE_LIMIT_PER_MINUTE` | 30 | Per client |
| `PLACE_PHOTOS_RATE_LIMIT_PER_MINUTE` | 60 | Per client |
| `PLACES_GLOBAL_RATE_LIMIT_PER_MINUTE` | 120 | All Places routes combined, **per server instance** |
| `TRUST_PROXY` | `false` | `true` only behind a proxy that overwrites `X-Forwarded-For`, such as Vercel. With `false`, all users share one per-client bucket. That is safe for cost but strict |

Rate limits are in memory and per instance. With several instances or serverless scaling, the effective limit multiplies, so the Google Cloud quotas remain the real ceiling. A shared store such as Redis is a possible M8 improvement.

## Kill switch

To stop all Google spend immediately:
1. Set `PLACES_PROVIDER=fixture` and redeploy. The app keeps working with clearly labelled demo data.
2. Or, faster without a deploy: disable or restrict the key in Google Cloud. The app then returns `503 UPSTREAM_UNAVAILABLE` with a friendly message, and the list UI stays usable.

## Verifying a live configuration

```bash
# .env.local
PLACES_PROVIDER=google
GOOGLE_PLACES_SERVER_API_KEY=<your restricted server key>

pnpm build && pnpm start          # or: pnpm dev
pnpm smoke:live                   # separate terminal. Billable: about 3 requests
```

`pnpm smoke:live` checks that live search returns Google-sourced cafes, that details load, and that the photo endpoint redirects to a Google image host. It only calls this app's API and never reads the key.

## Monitoring

Each Google call logs one line:

```json
{"level":"info","event":"places_api_call","endpoint":"nearbySearch","sku":"Nearby Search Enterprise","outcome":"ok","httpStatus":200,"attempt":0,"durationMs":312}
```

Alert on:
- a rising count of `places_api_call` (cost);
- `outcome` of `auth` (key revoked or misconfigured) or `quota` (quota exhausted);
- `rate_limited` events (abuse or limits set too low).

Logs never contain coordinates, place names, keys or response bodies.

## Secret hygiene

- `pnpm check:secrets` builds with canary values for every server secret and fails if any appears in the build output. Run it in CI (M8).
- If a key is exposed: rotate it in Google Cloud, update the host secret, redeploy, and review billing.
