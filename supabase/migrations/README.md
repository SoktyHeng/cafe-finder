# Migrations

Versioned SQL migrations, applied in filename order. Never run unreviewed destructive SQL against production.

| Migration | Purpose |
|---|---|
| `20261016000000_m5_profiles_favorites.sql` | Profiles, saved preferences, favorites, visited places. RLS, new-user trigger, `delete_own_account()` |

## Applying

Hosted Supabase project:

```bash
pnpm dlx supabase@2.119.0 login
pnpm dlx supabase@2.119.0 link --project-ref <project-ref>
pnpm dlx supabase@2.119.0 db push
```

You can also paste the file into the Supabase dashboard's SQL Editor and run it once.

The migration is covered by `src/test/db/rls.test.ts`, which runs it in PGlite (real Postgres in WASM) with Supabase's `auth` schema stubbed. That covers RLS, constraints, triggers and account deletion.

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
