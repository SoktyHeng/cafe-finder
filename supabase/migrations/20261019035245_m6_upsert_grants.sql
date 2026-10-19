-- M6 fix: let supabase-js upserts through without letting members move content.
--
-- `upsert()` reaches Postgres (via PostgREST) as
--   insert … on conflict (…) do update set <every column in the payload>
-- and Postgres checks UPDATE privilege on every SET column, including the
-- conflict keys, even when no conflict happens. The M6 migration granted UPDATE
-- on content columns only, so every report, review and vote save failed with
-- "permission denied".
--
-- Members now get UPDATE on the key columns too, and a trigger rejects any
-- update that actually changes one. Upserts re-set them to the same value.
-- `status`, `user_id` and timestamps remain non-updatable by members.
--
-- Rollback: see supabase/migrations/README.md.

create or replace function private.prevent_key_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'amenity_reports' then
    if new.google_place_id is distinct from old.google_place_id or new.amenity is distinct from old.amenity then
      raise exception 'The place and amenity of a report cannot be changed' using errcode = '23514';
    end if;
  elsif tg_table_name = 'place_reviews' then
    if new.google_place_id is distinct from old.google_place_id then
      raise exception 'The place of a review cannot be changed' using errcode = '23514';
    end if;
  elsif tg_table_name = 'review_votes' then
    if new.review_id is distinct from old.review_id then
      raise exception 'The review of a vote cannot be changed' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_key_change() from public, anon, authenticated;

create trigger amenity_reports_prevent_key_change
  before update on public.amenity_reports
  for each row execute function private.prevent_key_change();
create trigger place_reviews_prevent_key_change
  before update on public.place_reviews
  for each row execute function private.prevent_key_change();
create trigger review_votes_prevent_key_change
  before update on public.review_votes
  for each row execute function private.prevent_key_change();

grant update (google_place_id, amenity) on public.amenity_reports to authenticated;
grant update (google_place_id) on public.place_reviews to authenticated;
grant update (review_id) on public.review_votes to authenticated;
