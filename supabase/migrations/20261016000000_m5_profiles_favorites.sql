-- M5: profiles, saved preferences, favorites and visited places.
--
-- Only first-party data is stored. Google content (names, ratings, hours,
-- photos, reviews) is never persisted: places are referenced by Google place
-- ID only, which Google's terms allow storing indefinitely.
--
-- Every user-owned table has RLS with per-operation policies keyed on
-- auth.uid(). Nothing is granted to `anon`. Account deletion goes through a
-- narrow SECURITY DEFINER function, so normal routes never need the
-- service-role key.
--
-- Rollback: see supabase/migrations/README.md.

-- ---------------------------------------------------------------- helpers

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Google place IDs: letters, digits, '_' and '-', at most 512 characters (matches the
-- API validation). The length is checked separately: Postgres regex
-- repetition counts are capped at 255, so {1,512} is not valid there.
create domain public.google_place_id as text
  check (value ~ '^[A-Za-z0-9_-]+$' and char_length(value) <= 512);

-- ---------------------------------------------------------------- profiles

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- preferences

create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  default_purpose text not null default 'work'
    check (default_purpose in ('work', 'relax', 'friends', 'date')),
  default_radius_m integer not null default 3000
    check (default_radius_m between 1000 and 15000),
  min_rating numeric(2, 1) check (min_rating is null or min_rating between 0 and 5),
  open_now_only boolean not null default false,
  budget_tier text not null default 'any'
    check (budget_tier in ('any', 'under_5', '5_to_10', 'over_10')),
  prefer_quiet boolean not null default false,
  prefer_wifi boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- favorites

create table public.favorite_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  google_place_id public.google_place_id not null,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, google_place_id)
);

-- (user_id, google_place_id) is covered by the unique constraint's index.
create index favorite_places_user_created_idx
  on public.favorite_places (user_id, created_at desc);

create trigger favorite_places_set_updated_at
  before update on public.favorite_places
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- visited places

create table public.visit_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  google_place_id public.google_place_id not null,
  visit_date date,
  liked boolean,
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- M5 records "visited" once per place; per-visit history can come later.
  unique (user_id, google_place_id)
);

create index visit_feedback_user_created_idx
  on public.visit_feedback (user_id, created_at desc);

create trigger visit_feedback_set_updated_at
  before update on public.visit_feedback
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- abuse limits

-- Bounds per-user rows so a single account can't grow tables without limit.
create or replace function public.enforce_user_row_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  max_rows constant integer := 500;
  current_rows integer;
begin
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into current_rows
    using new.user_id;
  if current_rows >= max_rows then
    raise exception 'Row limit of % reached for %', max_rows, tg_table_name
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger favorite_places_row_limit
  before insert on public.favorite_places
  for each row execute function public.enforce_user_row_limit();

create trigger visit_feedback_row_limit
  before insert on public.visit_feedback
  for each row execute function public.enforce_user_row_limit();

-- ---------------------------------------------------------------- new users

-- Creates the profile and default preferences when Supabase Auth creates a user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  name text := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(name, 80))
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- account deletion

-- Deletes the caller's own auth user; every first-party table cascades.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;
  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.enforce_user_row_limit() from public, anon, authenticated;

-- ---------------------------------------------------------------- privileges

-- Supabase's default privileges grant ALL (including TRUNCATE, which bypasses
-- RLS) to anon and authenticated. Start from nothing and grant only what the
-- app needs. Profiles get no DELETE: they go only via delete_own_account().
revoke all on public.profiles, public.user_preferences, public.favorite_places, public.visit_feedback
  from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.user_preferences, public.favorite_places, public.visit_feedback
  to authenticated;

-- ---------------------------------------------------------------- row level security

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.favorite_places enable row level security;
alter table public.visit_feedback enable row level security;

-- `(select auth.uid())` is evaluated once per statement (Supabase performance guidance).

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: create own" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- No delete policy: profiles are removed only by delete_own_account() (cascade).

create policy "preferences: read own" on public.user_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "preferences: create own" on public.user_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "preferences: update own" on public.user_preferences
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "preferences: delete own" on public.user_preferences
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "favorites: read own" on public.favorite_places
  for select to authenticated using (user_id = (select auth.uid()));
create policy "favorites: create own" on public.favorite_places
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "favorites: update own" on public.favorite_places
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "favorites: delete own" on public.favorite_places
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "visits: read own" on public.visit_feedback
  for select to authenticated using (user_id = (select auth.uid()));
create policy "visits: create own" on public.visit_feedback
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "visits: update own" on public.visit_feedback
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "visits: delete own" on public.visit_feedback
  for delete to authenticated using (user_id = (select auth.uid()));
