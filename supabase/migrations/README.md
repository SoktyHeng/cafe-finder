# Migrations

Versioned SQL migrations, applied in filename order. Never run unreviewed destructive SQL against production.

| Migration | Purpose |
|---|---|
| `20261016000000_m5_profiles_favorites.sql` | Profiles, saved preferences, favorites, visited places. RLS, new-user trigger, `delete_own_account()` |
| `20261019031354_m6_community.sql` | Community amenity reports, reviews, votes, flags, moderators and moderation audit. RLS, column grants, limits, auto-hide, anonymized read functions |
| `20261019035245_m6_upsert_grants.sql` | Fix: UPDATE on key columns so supabase-js upserts work, plus a trigger that rejects key changes |

## Applying

Hosted Supabase project:

```bash
pnpm dlx supabase@2.119.0 login
pnpm dlx supabase@2.119.0 link --project-ref <project-ref>
pnpm dlx supabase@2.119.0 db push
```

You can also paste the file into the Supabase dashboard's SQL Editor and run it once.

The migrations are covered by `src/test/db/rls.test.ts` (M5) and `src/test/db/community.test.ts` (M6), which run them in PGlite (real Postgres in WASM) with Supabase's `auth` schema stubbed. That covers RLS, constraints, triggers and account deletion.

## Rollback (20261016000000)

The tables hold user data only, so dropping them deletes users' favorites and preferences. Take a backup first (`supabase db dump --data-only`).

```sql
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.delete_own_account();
drop function if exists public.handle_new_user();
drop table if exists public.visit_feedback;
drop table if exists public.favorite_places;
drop table if exists public.user_preferences;
drop table if exists public.profiles;
drop function if exists public.enforce_user_row_limit();
drop function if exists public.set_updated_at();
drop domain if exists public.google_place_id;
```

## Backfill

Users who signed up **before** this migration have no profile row. The app creates missing profile and preference rows on first use, through the `profiles: create own` and `preferences: create own` policies. To backfill in one go:

```sql
insert into public.profiles (id) select id from auth.users on conflict do nothing;
insert into public.user_preferences (user_id) select id from auth.users on conflict do nothing;
```

## Rollback (20261019031354)

Roll back `20261019035245` first (below). This deletes all member reports, reviews, votes, flags, moderators and the moderation audit trail. Take a backup first. Tables are dropped before their trigger functions. M5 is unaffected.

```sql
drop function if exists public.moderate_content(text, uuid, text);
drop function if exists public.moderation_queue();
drop function if exists public.am_i_moderator();
drop function if exists public.community_reviews(text, integer);
drop function if exists public.community_amenity_reports(text[]);
drop table if exists public.moderation_events;
drop table if exists public.moderators;
drop table if exists public.content_flags;
drop table if exists public.review_votes;
drop table if exists public.place_reviews;
drop table if exists public.amenity_reports;
drop schema if exists private cascade;
```

No backfill is needed. Existing visits from M5 count as confirmed visits automatically.

## Rollback (20261019035245)

Rolling this back alone breaks saving reports, reviews and votes from the app (every save fails with "permission denied"). Do it only together with the M6 rollback.

```sql
revoke update (google_place_id, amenity) on public.amenity_reports from authenticated;
revoke update (google_place_id) on public.place_reviews from authenticated;
revoke update (review_id) on public.review_votes from authenticated;
drop trigger if exists amenity_reports_prevent_key_change on public.amenity_reports;
drop trigger if exists place_reviews_prevent_key_change on public.place_reviews;
drop trigger if exists review_votes_prevent_key_change on public.review_votes;
drop function if exists private.prevent_key_change();
```
