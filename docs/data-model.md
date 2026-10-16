# Data model

Supabase Postgres holds **first-party data only**. Google content (names, ratings, hours, photos, reviews, coordinates) is never stored. Places are referenced by **Google place ID**, which Google's terms allow storing indefinitely, and display details are refetched when needed.

Migration: [supabase/migrations/20261016000000_m5_profiles_favorites.sql](../supabase/migrations/20261016000000_m5_profiles_favorites.sql). Rollback and backfill notes: [supabase/migrations/README.md](../supabase/migrations/README.md).

## Tables

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id` (PK, references `auth.users`, cascade), `display_name` (1–80 characters or null) | Created by the `on_auth_user_created` trigger. The name is taken from OAuth `full_name` or `name` metadata, truncated to 80 |
| `user_preferences` | `user_id` (PK, references `profiles`), `default_purpose`, `default_radius_m` (1000–15000), `min_rating` (0–5), `open_now_only`, `budget_tier`, `prefer_quiet`, `prefer_wifi` | Saved search defaults. Constraints mirror the API's Zod schema |
| `favorite_places` | `id`, `user_id` (defaults to `auth.uid()`), `google_place_id`, `notes` (≤500, user-authored), `created_at` | `unique(user_id, google_place_id)`, index on `(user_id, created_at desc)` |
| `visit_feedback` | `id`, `user_id`, `google_place_id`, `visit_date`, `liked`, `comment` (≤1000) | One "visited" record per place in M5 (unique per user and place). `liked` and `comment` are reserved for later feedback |

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

## Client access

The browser never queries tables directly. All reads and writes go through `/api/favorites`, `/api/visits`, `/api/preferences`, `/api/profile` and `/api/account`. Each verifies the session with `getClaims()`, rejects cross-site mutations, and calls Supabase **as the user**, so RLS applies. The publishable key in the browser is used only to read sign-in state for the UI.
