-- M6: community amenity reports, reviews, votes, flags and basic moderation.
--
-- All of this is first-party content written by Cafe Finder members. It is
-- stored separately from (and never mixed with) Google Places data, keyed by
-- Google place ID only.
--
-- Access model
--   * Base tables are owner-only under RLS (a member sees and edits their own
--     rows). Nothing is granted to `anon`.
--   * The public (including guests) reads ONLY anonymized, approved content
--     through narrow SECURITY DEFINER functions that never return user IDs.
--   * `status` can't be written by members (column privileges). It changes
--     only through triggers (auto-moderation, flags) and moderator functions.
--   * Internal helpers live in the non-exposed `private` schema.
--
-- Rollback: see supabase/migrations/README.md.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------- tables

create table public.amenity_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  google_place_id public.google_place_id not null,
  amenity text not null check (amenity in ('wifi', 'outlets', 'noise', 'seating', 'laptop_friendly')),
  value text not null,
  observed_on date not null default current_date,
  status text not null default 'approved' check (status in ('approved', 'pending', 'hidden', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Duplicate prevention: one current report per member, place and amenity.
  unique (user_id, google_place_id, amenity),
  constraint amenity_reports_value_valid check (
    (amenity = 'wifi' and value in ('yes', 'no'))
    or (amenity = 'outlets' and value in ('many', 'some', 'none'))
    or (amenity = 'noise' and value in ('quiet', 'moderate', 'loud'))
    or (amenity = 'seating' and value in ('comfortable', 'ok', 'uncomfortable'))
    or (amenity = 'laptop_friendly' and value in ('yes', 'no'))
  )
);

-- Public reads: approved reports per place.
create index amenity_reports_place_approved_idx
  on public.amenity_reports (google_place_id, amenity) where status = 'approved';
create index amenity_reports_moderation_idx
  on public.amenity_reports (updated_at) where status in ('pending', 'hidden');

create table public.place_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  google_place_id public.google_place_id not null,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 20 and 1000),
  status text not null default 'approved' check (status in ('approved', 'pending', 'hidden', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Duplicate prevention: one review per member and place (editable).
  unique (user_id, google_place_id)
);

create index place_reviews_place_approved_idx
  on public.place_reviews (google_place_id, created_at desc) where status = 'approved';
create index place_reviews_moderation_idx
  on public.place_reviews (updated_at) where status in ('pending', 'hidden');

create table public.review_votes (
  review_id uuid not null references public.place_reviews (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  helpful boolean not null,
  created_at timestamptz not null default now(),
  -- One vote per member and review.
  primary key (review_id, user_id)
);

create index review_votes_user_idx on public.review_votes (user_id);

create table public.content_flags (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('amenity_report', 'review')),
  target_id uuid not null,
  reporter_user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('spam', 'offensive', 'incorrect', 'personal_info', 'other')),
  created_at timestamptz not null default now(),
  -- One flag per member and item.
  unique (target_type, target_id, reporter_user_id)
);

create index content_flags_reporter_idx on public.content_flags (reporter_user_id);

create table public.moderators (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid references public.profiles (id) on delete set null,
  target_type text not null check (target_type in ('amenity_report', 'review')),
  target_id uuid not null,
  decision text not null check (decision in ('approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index moderation_events_moderator_idx on public.moderation_events (moderator_id);

create trigger amenity_reports_set_updated_at
  before update on public.amenity_reports
  for each row execute function public.set_updated_at();
create trigger place_reviews_set_updated_at
  before update on public.place_reviews
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- private helpers

-- True when the caller is a moderator. Used by moderation functions only.
create or replace function private.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.moderators where user_id = (select auth.uid()));
$$;

-- Status on member writes. Fires only when member-editable columns change,
-- so moderator and flag updates (status only) are not affected.
create or replace function private.community_status_on_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  suspicious boolean := false;
begin
  -- Each branch touches only its own table's columns (PL/pgSQL resolves
  -- NEW fields at run time, so referencing a missing one would fail).
  if tg_table_name = 'place_reviews' then
    -- Links, email addresses and phone numbers (local "012 345 678",
    -- international "+855 12 345 678", or 9+ consecutive digits) go to
    -- moderation first. Prices and hours ("$3.50", "7.00 - 21.00") must not match.
    -- Inlined (not a helper): this trigger runs with the member's privileges,
    -- and members have no access to the private schema.
    suspicious := new.body ~* '(https?://|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|(\+\d{1,3}[\s.-]?)?\m0?\d{2}[\s.-]\d{3}[\s.-]\d{3,4}\M|\m\d{9,}\M)';
  elsif new.observed_on > current_date + 1 or new.observed_on < current_date - 365 then
    raise exception 'observed_on must be within the last year' using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    new.status := case when suspicious then 'pending' else 'approved' end;
  elsif old.status in ('hidden', 'rejected', 'pending') then
    -- Editing moderated content never self-reinstates it.
    new.status := 'pending';
  else
    new.status := case when suspicious then 'pending' else 'approved' end;
  end if;
  return new;
end;
$$;

create trigger amenity_reports_status_on_write
  before insert or update of value, observed_on on public.amenity_reports
  for each row execute function private.community_status_on_write();
create trigger place_reviews_status_on_write
  before insert or update of rating, body on public.place_reviews
  for each row execute function private.community_status_on_write();

-- Limited submissions: per-member caps per rolling day and in total.
-- Args: owner column, daily cap, total cap.
create or replace function private.enforce_contribution_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  owner_column text := tg_argv[0];
  daily_cap integer := tg_argv[1]::integer;
  total_cap integer := tg_argv[2]::integer;
  owner uuid;
  today_count integer;
  total_count integer;
begin
  execute format('select ($1).%I', owner_column) into owner using new;
  execute format(
    'select count(*) filter (where created_at > now() - interval ''1 day''), count(*) from %I.%I where %I = $1',
    tg_table_schema, tg_table_name, owner_column
  ) into today_count, total_count using owner;
  if today_count >= daily_cap then
    raise exception 'Daily limit of % reached for %', daily_cap, tg_table_name using errcode = 'check_violation';
  end if;
  if total_count >= total_cap then
    raise exception 'Row limit of % reached for %', total_cap, tg_table_name using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger amenity_reports_limits
  before insert on public.amenity_reports
  for each row execute function private.enforce_contribution_limits('user_id', '50', '2000');
create trigger place_reviews_limits
  before insert on public.place_reviews
  for each row execute function private.enforce_contribution_limits('user_id', '10', '500');
create trigger review_votes_limits
  before insert on public.review_votes
  for each row execute function private.enforce_contribution_limits('user_id', '200', '5000');
create trigger content_flags_limits
  before insert on public.content_flags
  for each row execute function private.enforce_contribution_limits('reporter_user_id', '20', '1000');

-- Votes only on others' approved reviews (reads other members' rows, hence definer).
create or replace function private.check_review_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
  review_status text;
begin
  select user_id, status into author, review_status from public.place_reviews where id = new.review_id;
  if author is null or review_status <> 'approved' then
    raise exception 'Review not available for voting' using errcode = 'check_violation';
  end if;
  if author = new.user_id then
    raise exception 'You cannot vote on your own review' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger review_votes_check
  before insert or update on public.review_votes
  for each row execute function private.check_review_vote();

-- Flags only on others' approved content.
create or replace function private.check_flag_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
  target_status text;
begin
  if new.target_type = 'amenity_report' then
    select user_id, status into author, target_status from public.amenity_reports where id = new.target_id;
  else
    select user_id, status into author, target_status from public.place_reviews where id = new.target_id;
  end if;
  if author is null or target_status <> 'approved' then
    raise exception 'Content not available for flagging' using errcode = 'check_violation';
  end if;
  if author = new.reporter_user_id then
    raise exception 'You cannot flag your own content' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger content_flags_check
  before insert on public.content_flags
  for each row execute function private.check_flag_target();

-- Three distinct flags hide content until a moderator decides.
create or replace function private.apply_flag_threshold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hide_threshold constant integer := 3;
  flag_count integer;
begin
  select count(*) into flag_count from public.content_flags
  where target_type = new.target_type and target_id = new.target_id;
  if flag_count >= hide_threshold then
    if new.target_type = 'amenity_report' then
      update public.amenity_reports set status = 'hidden' where id = new.target_id and status = 'approved';
    else
      update public.place_reviews set status = 'hidden' where id = new.target_id and status = 'approved';
    end if;
  end if;
  return new;
end;
$$;

create trigger content_flags_threshold
  after insert on public.content_flags
  for each row execute function private.apply_flag_threshold();

-- Flags have no foreign key (they target two tables); remove them with their target.
create or replace function private.delete_flags_for_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.content_flags
  where target_id = old.id
    and target_type = case tg_table_name when 'amenity_reports' then 'amenity_report' else 'review' end;
  return old;
end;
$$;

create trigger amenity_reports_delete_flags
  after delete on public.amenity_reports
  for each row execute function private.delete_flags_for_target();
create trigger place_reviews_delete_flags
  after delete on public.place_reviews
  for each row execute function private.delete_flags_for_target();

revoke all on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------- public read API (anonymized)

-- Approved reports from the last year for up to 50 places. No user IDs.
-- `confirmed_visit`: the reporter marked the place as visited.
create or replace function public.community_amenity_reports(place_ids text[])
returns table (
  google_place_id text,
  amenity text,
  value text,
  observed_on date,
  confirmed_visit boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(array_length(place_ids, 1), 0) > 50 then
    raise exception 'At most 50 places per request' using errcode = 'invalid_parameter_value';
  end if;
  return query
    select r.google_place_id::text, r.amenity, r.value, r.observed_on,
           exists (
             select 1 from public.visit_feedback v
             where v.user_id = r.user_id and v.google_place_id = r.google_place_id
           )
    from public.amenity_reports r
    where r.google_place_id = any (place_ids)
      and r.status = 'approved'
      and r.observed_on >= current_date - 365
    order by r.observed_on desc
    limit 5000;
end;
$$;

-- Approved reviews for one place with vote tallies. `is_own` lets the UI hide
-- voting/flagging on the caller's own review; no author identity is returned.
create or replace function public.community_reviews(place_id text, max_results integer default 20)
returns table (
  id uuid,
  rating smallint,
  body text,
  created_at timestamptz,
  updated_at timestamptz,
  confirmed_visit boolean,
  helpful_count integer,
  not_helpful_count integer,
  is_own boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.rating, r.body, r.created_at, r.updated_at,
         exists (
           select 1 from public.visit_feedback v
           where v.user_id = r.user_id and v.google_place_id = r.google_place_id
         ),
         (select count(*)::integer from public.review_votes rv where rv.review_id = r.id and rv.helpful),
         (select count(*)::integer from public.review_votes rv where rv.review_id = r.id and not rv.helpful),
         coalesce(r.user_id = (select auth.uid()), false)
  from public.place_reviews r
  where r.google_place_id = place_id and r.status = 'approved'
  order by r.created_at desc
  limit least(greatest(coalesce(max_results, 20), 1), 50);
$$;

revoke all on function public.community_amenity_reports(text[]) from public;
revoke all on function public.community_reviews(text, integer) from public;
grant execute on function public.community_amenity_reports(text[]) to anon, authenticated;
grant execute on function public.community_reviews(text, integer) to anon, authenticated;

-- ---------------------------------------------------------------- moderation API

create or replace function public.am_i_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_moderator();
$$;

-- Pending and hidden content with flag details. Moderators only.
create or replace function public.moderation_queue()
returns table (
  target_type text,
  target_id uuid,
  google_place_id text,
  status text,
  amenity text,
  value text,
  rating smallint,
  body text,
  flag_count integer,
  flag_reasons text[],
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_moderator() then
    raise exception 'Moderators only' using errcode = 'insufficient_privilege';
  end if;
  return query
    select 'amenity_report'::text, a.id, a.google_place_id::text, a.status, a.amenity, a.value,
           null::smallint, null::text,
           (select count(*)::integer from public.content_flags f where f.target_type = 'amenity_report' and f.target_id = a.id),
           (select coalesce(array_agg(distinct f.reason), '{}') from public.content_flags f where f.target_type = 'amenity_report' and f.target_id = a.id),
           a.updated_at
    from public.amenity_reports a where a.status in ('pending', 'hidden')
    union all
    select 'review'::text, r.id, r.google_place_id::text, r.status, null::text, null::text,
           r.rating, r.body,
           (select count(*)::integer from public.content_flags f where f.target_type = 'review' and f.target_id = r.id),
           (select coalesce(array_agg(distinct f.reason), '{}') from public.content_flags f where f.target_type = 'review' and f.target_id = r.id),
           r.updated_at
    from public.place_reviews r where r.status in ('pending', 'hidden')
    order by 11
    limit 200;
end;
$$;

-- Approve (clears flags) or reject pending/hidden content. Moderators only; audited.
create or replace function public.moderate_content(target_type text, target_id uuid, decision text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if not private.is_moderator() then
    raise exception 'Moderators only' using errcode = 'insufficient_privilege';
  end if;
  if decision not in ('approved', 'rejected') or target_type not in ('amenity_report', 'review') then
    raise exception 'Invalid moderation request' using errcode = 'invalid_parameter_value';
  end if;

  if target_type = 'amenity_report' then
    update public.amenity_reports set status = decision where id = target_id and status in ('pending', 'hidden', 'approved');
  else
    update public.place_reviews set status = decision where id = target_id and status in ('pending', 'hidden', 'approved');
  end if;
  get diagnostics changed = row_count;
  if changed = 0 then
    raise exception 'Content not found' using errcode = 'no_data_found';
  end if;

  if decision = 'approved' then
    -- Reset the flag count so past flags can't immediately re-hide it.
    delete from public.content_flags f where f.target_type = moderate_content.target_type and f.target_id = moderate_content.target_id;
  end if;
  insert into public.moderation_events (moderator_id, target_type, target_id, decision)
  values ((select auth.uid()), target_type, target_id, decision);
end;
$$;

revoke all on function public.am_i_moderator() from public, anon;
revoke all on function public.moderation_queue() from public, anon;
revoke all on function public.moderate_content(text, uuid, text) from public, anon;
grant execute on function public.am_i_moderator() to authenticated;
grant execute on function public.moderation_queue() to authenticated;
grant execute on function public.moderate_content(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------- privileges

-- Start from nothing (Supabase defaults grant ALL, including TRUNCATE).
revoke all on public.amenity_reports, public.place_reviews, public.review_votes,
  public.content_flags, public.moderators, public.moderation_events
  from anon, authenticated;

-- Members write only content columns; `status`, `user_id` and timestamps are server-controlled.
grant select, delete on public.amenity_reports to authenticated;
grant insert (google_place_id, amenity, value, observed_on) on public.amenity_reports to authenticated;
grant update (value, observed_on) on public.amenity_reports to authenticated;

grant select, delete on public.place_reviews to authenticated;
grant insert (google_place_id, rating, body) on public.place_reviews to authenticated;
grant update (rating, body) on public.place_reviews to authenticated;

grant select, delete on public.review_votes to authenticated;
grant insert (review_id, helpful) on public.review_votes to authenticated;
grant update (helpful) on public.review_votes to authenticated;

grant select on public.content_flags to authenticated;
grant insert (target_type, target_id, reason) on public.content_flags to authenticated;

-- moderators and moderation_events: no grants. Managed by admins via SQL.

-- ---------------------------------------------------------------- row level security

alter table public.amenity_reports enable row level security;
alter table public.place_reviews enable row level security;
alter table public.review_votes enable row level security;
alter table public.content_flags enable row level security;
alter table public.moderators enable row level security;
alter table public.moderation_events enable row level security;

create policy "amenity reports: read own" on public.amenity_reports
  for select to authenticated using (user_id = (select auth.uid()));
create policy "amenity reports: create own" on public.amenity_reports
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "amenity reports: update own" on public.amenity_reports
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "amenity reports: delete own" on public.amenity_reports
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "reviews: read own" on public.place_reviews
  for select to authenticated using (user_id = (select auth.uid()));
create policy "reviews: create own" on public.place_reviews
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "reviews: update own" on public.place_reviews
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "reviews: delete own" on public.place_reviews
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "votes: read own" on public.review_votes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "votes: create own" on public.review_votes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "votes: update own" on public.review_votes
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "votes: delete own" on public.review_votes
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "flags: read own" on public.content_flags
  for select to authenticated using (reporter_user_id = (select auth.uid()));
create policy "flags: create own" on public.content_flags
  for insert to authenticated with check (reporter_user_id = (select auth.uid()));
-- No update/delete on flags: a flag stands until a moderator approves the content.
-- moderators / moderation_events: RLS on with no policies (no direct access).
