# Data model

Supabase Postgres holds **first-party data only**. Google content (names, ratings, hours, photos, reviews, coordinates) is never stored. Places are referenced by **Google place ID**, which Google's terms allow storing indefinitely, and display details are refetched when needed.

Migrations: [20261016000000_m5_profiles_favorites.sql](../supabase/migrations/20261016000000_m5_profiles_favorites.sql) (M5) and [20261019031354_m6_community.sql](../supabase/migrations/20261019031354_m6_community.sql) (M6, see [Community](#community-m6)). Rollback and backfill notes: [supabase/migrations/README.md](../supabase/migrations/README.md).

## Tables

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id` (PK, references `auth.users`, cascade), `display_name` (1–80 characters or null) | Created by the `on_auth_user_created` trigger. The name is taken from OAuth `full_name` or `name` metadata, truncated to 80 |
| `user_preferences` | `user_id` (PK, references `profiles`), `default_purpose`, `default_radius_m` (1000–15000), `min_rating` (0–5), `open_now_only`, `budget_tier`, `prefer_quiet`, `prefer_wifi` | Saved search defaults. Constraints mirror the API's Zod schema |
| `favorite_places` | `id`, `user_id` (defaults to `auth.uid()`), `google_place_id`, `notes` (≤500, user-authored), `created_at` | `unique(user_id, google_place_id)`, index on `(user_id, created_at desc)` |
| `visit_feedback` | `id`, `user_id`, `google_place_id`, `visit_date`, `liked`, `comment` (≤1000) | One "visited" record per place (unique per user and place). From M6, a visit marks that member's reports and review for the place as a **confirmed visit**. `liked` and `comment` remain reserved |

- `google_place_id` is a domain: letters, digits, `_` and `-`, at most 512 characters. The length is checked separately, because Postgres regex repetition counts are capped at 255.
- `updated_at` is maintained by triggers.
- A user can have at most **500** favorites and 500 visits. A trigger enforces this, and the API reports "limit of 500".

## Row Level Security

RLS is enabled on every table. Policies apply `to authenticated` and use `(select auth.uid())`, which Supabase evaluates once per statement for performance.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | own (`id = auth.uid()`) | own | own (`using` and `with check`) | **none.** Only `delete_own_account()` removes profiles |
| `user_preferences` | own | own | own | own |
| `favorite_places` | own | own | own (can't reassign `user_id`) | own |
| `visit_feedback` | own | own | own | own |

**Privileges.** Supabase's default privileges grant ALL to `anon` and `authenticated`, including **TRUNCATE, which bypasses RLS**. The migration revokes everything from both roles and grants back only the operations above. `anon` gets nothing.

**Account deletion.** `public.delete_own_account()` is `SECURITY DEFINER` with `search_path = ''`. It deletes only `auth.users where id = auth.uid()`, and every first-party table cascades. It can be executed by `authenticated` only and raises an error without a user. Normal routes therefore never need the service-role key.

**Verified by** [src/test/db/rls.test.ts](../src/test/db/rls.test.ts), 20 tests running the real migration in PGlite (Postgres 18.3 compiled to WASM; hosted Supabase runs Postgres 15–17, and the migration uses only features available in all of them) with Supabase's `auth` schema stubbed:
- cross-user SELECT, UPDATE and DELETE are invisible or affect 0 rows;
- cross-user INSERT and user reassignment are rejected;
- anonymous access, profile deletion and TRUNCATE get permission denied;
- constraints and the row cap hold;
- the trigger and cascades work, and account deletion removes only the caller.

## Retention

| Data | Retention |
|---|---|
| Profile, preferences, favorites (with notes), visits | Until the user deletes them, or deletes the account (which cascades immediately) |
| Google content | Never stored. Summaries (name, address) are refetched per favorites-page view |
| Coordinates | Never stored. Saved defaults have no location |
| Auth records | Managed by Supabase Auth. Removed with the account |
| Amenity reports, reviews, votes, flags | Until the member deletes them or the account (cascade). Reports older than a year stop being shown or counted, but are kept until deleted |
| Moderation events | Kept for audit. The moderator reference is cleared if that account is deleted |

## Community (M6)

Migration: [20261019031354_m6_community.sql](../supabase/migrations/20261019031354_m6_community.sql). Everything here is **original member content**. Places are referenced only by Google place ID, and no Google data is stored.

| Table | Key columns | Notes |
|---|---|---|
| `amenity_reports` | `user_id`, `google_place_id`, `amenity` (wifi, outlets, noise, seating, laptop_friendly), `value` (checked per amenity), `observed_on`, `status` | `unique(user_id, google_place_id, amenity)`: a member updates their answer rather than adding more |
| `place_reviews` | `user_id`, `google_place_id`, `rating` 1–5, `body` 20–1000 characters, `status` | `unique(user_id, google_place_id)` |
| `review_votes` | PK `(review_id, user_id)`, `helpful` | One vote per member per review |
| `content_flags` | `target_type`, `target_id`, `reporter_user_id`, `reason` | Unique per reporter and target |
| `moderators` | `user_id` | No grants. An admin adds rows in the SQL editor ([deployment.md](deployment.md#community-moderation-m6)) |
| `moderation_events` | `moderator_id`, target, `decision`, `created_at` | Audit trail. No grants |

**Status lifecycle.** A status is one of `approved`, `pending`, `hidden` or `rejected`. Members can't write `status`; only triggers and `moderate_content` change it.
- New content starts **approved**. The exception is a review containing a URL, an email address or a phone-number pattern, which starts **pending**.
- Editing pending, hidden or rejected content sends it back to **pending**.
- Flags from **3** different members hide content automatically (**hidden**). It stays hidden until a moderator approves it (which clears the flags) or rejects it.
- Only **approved** content is returned by the public read functions and used in ranking.

**Duplicate prevention and limits.** Triggers enforce these caps, and the API reports a breach as 429.

| Content | Per day | Total per member |
|---|---|---|
| Amenity answers | 50 | 2000 |
| Reviews | 10 | 500 |
| Votes | 200 | 5000 |
| Flags | 20 | 1000 |

**Access.**
- **RLS on every table.** Members can SELECT, INSERT, UPDATE and DELETE only their own reports, reviews and votes. For flags, they can SELECT and INSERT their own.
- **Column grants.** All privileges are revoked first. INSERT and UPDATE are then granted on the columns members write, so clients can't set `status`, `user_id` or timestamps. `anon` has no table access.
- **Key columns can't change.** UPDATE also covers the key columns (`google_place_id`, `amenity`, `review_id`), because supabase-js `upsert()` re-sets every payload column and Postgres checks UPDATE privilege on all of them. A `prevent_key_change` trigger ([20261019035245_m6_upsert_grants.sql](../supabase/migrations/20261019035245_m6_upsert_grants.sql)) rejects any update that actually changes one, so a member can't move a report, review or vote elsewhere.
- **Private helpers.** Helpers live in a `private` schema that clients can't use. `SECURITY DEFINER` checks stop members voting on or flagging their own content, or content they can't see.
- **Public read functions** (`SECURITY DEFINER`, `search_path = ''`):
  - `community_amenity_reports(place_ids)`: approved reports from the last year, for at most 50 places per call, with no user IDs. Each row says whether the reporter had marked the place visited.
  - `community_reviews(place_id, max_results)`: approved reviews with vote counts and `is_own`, with no user IDs.
  - `am_i_moderator()`, `moderation_queue()` and `moderate_content(...)` for signed-in users. The last two raise "Moderators only" for everyone else.
- **Advisor warnings.** Supabase's security advisor warns that these definer functions are callable. That is intended: each one checks the caller and returns anonymized data only.

**Verified by** [src/test/db/community.test.ts](../src/test/db/community.test.ts) (36 tests on the real migrations in PGlite, including upserts exactly as supabase-js sends them), and by rolled-back live checks against the hosted project (see [milestones.md](milestones.md#m6--original-community-amenities)).

## Client access

The browser never queries tables directly. All reads and writes go through `/api/favorites`, `/api/visits`, `/api/preferences`, `/api/profile`, `/api/account`, `/api/community/…` and `/api/moderation`. Guests' community reads use only the public read functions. Each verifies the session with `getClaims()`, rejects cross-site mutations, and calls Supabase **as the user**, so RLS applies. The publishable key in the browser is used only to read sign-in state for the UI.
