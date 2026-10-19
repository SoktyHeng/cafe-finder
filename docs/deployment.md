# Deployment and operations

## Optional AI search (M7)

Off by default: `ENABLE_AI=false`. To enable, set `ENABLE_AI=true`, `AI_PROVIDER=openai`, and `OPENAI_API_KEY` in server secrets, then rebuild/restart. The model identifier is fixed to `gpt-5.6-luna` in `lib/ai/openai-provider.ts`; a model change requires price/cap review and the live acceptance evaluation. Never use a `NEXT_PUBLIC_` AI key. `assertSeparateGoogleKeys` also rejects an OpenAI key accidentally configured in one of the supported browser-key fields.

The OpenAI provider calls `api.openai.com` and requires an OpenAI project API key. NVIDIA (`nvapi-…`) and Azure/Foundry credentials cannot authenticate to that endpoint. The evaluation command rejects NVIDIA-format credentials when OpenAI is selected. It reads AI settings from the shell, `.env.local`, then `.env`. Keep those files ignored; never paste credentials into chat or commit them.

### NVIDIA NIM

Set `ENABLE_AI=true`, `AI_PROVIDER=nvidia` and `NVIDIA_API_KEY` to use `openai/gpt-oss-20b` at the fixed server endpoint `https://integrate.api.nvidia.com/v1/chat/completions`. For existing local setups only, a legacy `OPENAI_API_KEY` value beginning `nvapi-` is accepted when NVIDIA is selected; prefer moving it to `NVIDIA_API_KEY`. Neither endpoint nor model can be set by a browser request. OpenAI-hosted access remains a separate provider with separate credentials.

The NVIDIA adapter uses strict JSON Schema, non-streamed responses, low reasoning effort, at most 2,048 completion tokens, a 30-second timeout, and no automatic retries. Reasoning text is never exposed or logged. It returns only validated filter fields, and rejects tool calls, refusals, truncation and malformed output. The UI names NVIDIA in the disclosure when selected.

`AI_DAILY_REQUEST_LIMIT=50` caps NVIDIA attempts per process per 24-hour window starting at the first attempt; failures count. Existing client/global AI limits also apply. Logs record provider/model, status, latency and input/output tokens. NVIDIA's hosted endpoint is offered for prototyping; quota/credits and any commercial pricing are controlled by your NVIDIA account. We do not assign invented dollar prices to its usage: request/token caps bound volume, while NVIDIA account quotas remain the billing boundary. The OpenAI micro-USD reservation below applies only to the OpenAI provider. All process-local limits reset on restart and multiply across replicas.

Official NVIDIA references: [GPT-OSS endpoint](https://docs.api.nvidia.com/nim/reference/openai-gpt-oss-20b-infer), [hosted model and key setup](https://build.nvidia.com/openai/gpt-oss-20b). The app sends search text/history and preference values to the selected provider, not selected coordinates or Google cafe data.

Offline: `ENABLE_AI=true AI_PROVIDER=fixture PLACES_PROVIDER=fixture` (set these as individual environment variables). Scripted examples live in `lib/ai/fixture-provider.ts`. Other messages ask for clarification. The app labels both the scripted parser and fictional cafe data; combining the scripted parser with live Google Places is rejected.

Controls:

| Variable | Default | Meaning |
|---|---|---|
| `AI_RATE_LIMIT_PER_MINUTE` | 5 | Per hashed client, 1–60 |
| `AI_GLOBAL_RATE_LIMIT_PER_MINUTE` | 30 | Whole process, 1–1,000 |
| `AI_DAILY_BUDGET_MICRO_USD` | 1,000,000 | $1 per UTC day per process; each attempted OpenAI call reserves $0.02 with no refund |

The daily reservation is synchronous, so simultaneous calls cannot overspend the in-process allowance. At most 50 attempts/day at the default budget. Failed calls also consume a reservation. Input, including instructions/schema, is capped at 20,000 UTF-8 bytes and output at 512 tokens. With the reviewed standard rates ($0.20/M input, $1.20/M output tokens), the $0.02 reservation exceeds a worst-case request; cached-token discounts are ignored, and estimates use a 25% input-price buffer for possible cache writes. The model page lists an alias only, so provider changes require reevaluation. Limits reset at UTC midnight or process restart, and **multiply across instances**. They are not an account-wide billing guarantee. Set OpenAI project restrictions, spend alerts and appropriate quotas; a durable shared budget would require additional infrastructure outside this M7 process-local design. Do not scale replicas while assuming a $1 account-wide cap.

Observe `ai_call` logs (model, outcome, duration) and `ai_usage` (input/output token counts, conservative estimated micro USD, cumulative reserved micro USD). No raw prompts, coordinates, account IDs, cafe data, vendor payloads or credentials are logged. Reserve failures return a safe 429; network, timeout, refusal, malformed/incomplete output and vendor 4xx/5xx fail safely without retries. The UI preserves settings and links to normal discovery.

Kill switch: set `ENABLE_AI=false`, rebuild/restart. Ordinary search does not depend on AI. For a live interpreter check, run `pnpm test:ai:live` (12 billable parser calls, no Places calls). Then run the manual flow: first search in BKK1; refine radius/open-now; remove a preference; try near-me with location denied; verify unsupported locations ask for clarification; compare card reasons to their underlying facts. Test the selected AI provider + live Google only when both credentials are configured. Do not label mock or scripted runs as live AI verification.

Official references reviewed 2026-10-19: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [model and pricing](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [Google Places policy](https://developers.google.com/maps/documentation/places/web-service/policies). `store:false` disables stored Responses state; it is not a claim of zero provider retention. Search text typed by the user can still contain personal information; the UI tells users what is sent and discourages sensitive details.

This covers the M2 scope: Google Places configuration. The production checklist is completed in M8.

## Google Cloud setup

1. Create **separate projects or keys for local, staging and production**.
2. Enable **Places API (New)**. The legacy Places API is not used.
3. Create the **server key** (`GOOGLE_PLACES_SERVER_API_KEY`):
   - API restriction: **Places API (New)** only.
   - Application restriction: IP addresses where the host has stable egress IPs. Most serverless hosts, including standard Vercel, don't, so rely on the API restriction, quotas and the fact that the key never leaves the server.
   - Never prefix it with `NEXT_PUBLIC_`. Store it only in the host's secret store or `.env.local`, which is git-ignored.
4. Create a **separate browser key** (`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`) for the map (M4):
   - Application restriction: **Websites (HTTP referrers)**, for example `http://localhost:3000/*` for local development and `https://your-domain/*` for production. Add every deployed domain, including `https://<project>.vercel.app/*`. A missing referrer shows as `RefererNotAllowedMapError` in the browser console, and the site shows "The map couldn't load" while the list keeps working.
   - API restriction: **Maps JavaScript API** only.
   - It ships to every visitor by design. The server refuses to start if it equals a server key.
   - Optional: create a **Map ID** (Google Cloud → Map Management, JavaScript, Vector) and set `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. Without one, Google's `DEMO_MAP_ID` is used, which is fine for development only.
   - `NEXT_PUBLIC_*` values are inlined at build time, so **rebuild after changing them**.
   - Without a browser key, the site shows "Map not available" and the list and directions keep working.
5. Set **quotas** under APIs & Services → Places API (New) → Quotas: requests per minute and per day for Nearby Search, Place Details and Place Photo, sized to expected traffic. Also set a daily quota for Maps JavaScript API map loads.
6. Set a **billing budget with alerts**, for example at 50%, 90% and 100%. Budgets alert but do not cap spending, so the quotas are the hard limit.

## Supabase setup (M5)

1. Create a project at supabase.com (one per environment). In **Project Settings → API**, copy the **Project URL** into `NEXT_PUBLIC_SUPABASE_URL` and the **publishable** key into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (legacy projects: the anon key). These are public by design: RLS enforces access. **Never** put the service-role or secret key in a `NEXT_PUBLIC_` variable; the server refuses to start if you do.
2. Apply the migration: `supabase db push` (see [supabase/migrations/README.md](../supabase/migrations/README.md)), or paste the file into the SQL Editor once.
3. Under **Authentication → URL Configuration**:
   - set **Site URL** to the app URL (`http://localhost:3000` locally);
   - add redirect URLs `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/confirm`, plus the same for each deployed domain.
4. Under **Authentication → Providers → Email**:
   - keep **Confirm email** on;
   - set the minimum password length to **8** (the app enforces 8–72);
   - enable **leaked password protection** if your plan offers it.
5. Under **Authentication → Email Templates → Confirm signup**, link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}`. This works in any browser, with no PKCE verifier needed.
6. **Google sign-in:**
   - In Google Cloud, go to **APIs & Services → Credentials → Create OAuth client ID** and choose **Web application**.
   - Set the authorized redirect URI to `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Paste the client ID and secret into **Supabase → Authentication → Providers → Google**.
   - This OAuth client is separate from the Maps API keys.
7. Rebuild after setting the `NEXT_PUBLIC_SUPABASE_*` values (they're inlined at build time).

Without Supabase, the site runs in **guest-only mode**. Search, map and details all work. Sign-in UI is hidden, and `/login`, `/favorites` and `/account` explain that accounts aren't available.

**Manual live check** (after setup):
1. Create an account at `/login`, confirm it from the email, and you should land back where you started.
2. Save a cafe from `/discover`. It appears under `/favorites` with its name, and notes save.
3. Mark a cafe as visited on its details page.
4. Change your defaults at `/account`. The home form starts from them.
5. Sign in on a second browser. Your favorites are there too.
6. Sign out. `/favorites` now redirects to `/login?next=%2Ffavorites`.
7. "Continue with Google" works.
8. Delete the account at `/account`. In the Supabase table editor, that user's rows are gone.

## Community moderation (M6)

Apply `20261019031354_m6_community.sql` with `supabase db push`, as for M5.

**Add a moderator.** Find the user's ID under **Authentication → Users**, then run this as an admin in the **SQL Editor**:

```sql
insert into public.moderators (user_id) values ('<user-uuid>');
-- remove: delete from public.moderators where user_id = '<user-uuid>';
```

Moderators get a "Moderation" page at `/moderation` showing pending reviews and flagged content, with Approve and Reject. Every decision is recorded in `moderation_events`. There's no in-app way to become a moderator.

**Security advisor.** `supabase db advisors --linked` reports WARN-level findings about callable `SECURITY DEFINER` functions: `community_amenity_reports`, `community_reviews`, `am_i_moderator`, `moderation_queue`, `moderate_content` and `delete_own_account`. These are accepted. Each one checks its caller, uses `search_path = ''`, and returns anonymized data only. Enable **leaked password protection**, the other warning, in the dashboard.

**Manual live check** (two accounts, A and B):
1. As A, report Wi-Fi on a cafe's details page and post a review. Both appear.
2. Post a review containing a phone number. It says a moderator will check it first, and others don't see it.
3. As B, mark A's review "Helpful", then report it. Neither control appears on B's own review.
4. As a moderator, open `/moderation`. Approve the held review; it becomes visible.
5. On `/discover`, a cafe with reports from two members shows "From Cafe Finder members (not Google)" on its card.

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

`pnpm smoke:live` checks that live search returns Google-sourced cafes, that details load with reviews and amenities, and that the photo endpoint redirects to a Google image host. It only calls this app's API and never reads the key.

**Map check (manual, after setting a browser key):** open `/discover?area=bkk1&purpose=work&radius=3000` at desktop width.
- Numbered markers and a blue search-centre pin appear, and the map frames them.
- Clicking a marker highlights and scrolls to its card. "Show on map" on a card pans to its marker.
- Google's logo and attribution are visible.
- At phone width, the List/Map toggle works and the map loads only when Map is chosen.

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
