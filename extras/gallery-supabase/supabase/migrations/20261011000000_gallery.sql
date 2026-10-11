-- =============================================================================
-- Spinlabel community gallery: schema, row level security, RPCs and storage.
--
-- Run once in the Supabase SQL editor (or `supabase db push`). Idempotent where
-- practical, so re-running it after changes is safe.
--
-- Naming: EVERYTHING created here is prefixed with "sticker_" (tables,
-- functions, triggers, policies, indexes) and the storage bucket is called
-- 'sticker-gallery', so this migration can be applied to an existing Supabase
-- project that already has its own public.profiles, reports, ... tables
-- without any collision. The only external touch points are:
--   * a trigger on auth.users (sticker_on_auth_user_created)
--   * policies on storage.objects (all named "sticker-gallery: ...")
--   * public.sticker_is_admin(uid): the ONE place that decides who is an admin.
--     To reuse an existing role system later, only redefine that function
--     (e.g. select exists (select 1 from public.profiles where id = uid and role = 'admin')).
--
-- Security model in short
--   * Every table has RLS enabled. Clients only get the table/column privileges
--     granted explicitly below (default Supabase grants are revoked first).
--   * Counters (likes, reports, downloads) and moderation status are NEVER
--     writable by clients directly; they change through triggers and
--     SECURITY DEFINER functions with a fixed search_path.
--   * Uploads are moderated: every new design starts as 'pending' and is only
--     publicly visible after an admin set it to 'published'.
--
--   * Files of a design are immutable for the uploader as soon as the design
--     row exists (no upload/delete into that folder), so content cannot be
--     swapped after an admin approved it.
--
-- Known / accepted limitation (documented on purpose)
--   The storage bucket 'sticker-gallery' is PUBLIC so that thumbnails can be
--   served directly (fast, cached, no signed URLs). That means files of designs
--   that are still 'pending' (or 'hidden') can technically be fetched by anyone
--   who knows the full path. The user id part of the path is public (it is a
--   column of every published design), but the design id of a pending design
--   is a random UUID that is only known to its uploader and admins, and listing
--   the bucket via the API is restricted to the owner and admins. The uploader
--   can share that link himself, though (see docs/SETUP-SUPABASE.md).
--   Rejected designs have their files deleted by the app (admin storage
--   delete policy below).
-- =============================================================================

-- Characters that are never allowed in user visible names/titles: C0/C1
-- control characters, zero width characters and bidi overrides (spoofing).
-- Kept in sync with FORBIDDEN_TEXT_CHARS in src/services/gallery.ts.
--   [\x01-\x1F\x7F-\x9F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]


-- ---------------------------------------------------------------------------
-- sticker_profiles
-- ---------------------------------------------------------------------------

create table if not exists public.sticker_profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 24),
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- THE admin check. Everything else (policies, RPCs) calls this function only.
-- Redefine it to plug in another role system. Privacy guard: it only answers
-- for the caller's own uid (policies always pass auth.uid()), so nobody can
-- probe whether some other user id belongs to an admin.
create or replace function public.sticker_is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin
     from public.sticker_profiles p
     where p.id = uid and uid is not distinct from auth.uid()),
    false);
$$;

revoke all on function public.sticker_is_admin(uuid) from public, anon, authenticated;
grant execute on function public.sticker_is_admin(uuid) to anon, authenticated;

alter table public.sticker_profiles enable row level security;

-- Display names: no leading/trailing blanks, no control/zero width/bidi
-- characters (impersonation, layout breaking). NOT VALID: only new and updated
-- rows are checked, so re-running the migration never fails on old data.
alter table public.sticker_profiles drop constraint if exists sticker_profiles_display_name_chars_ck;
alter table public.sticker_profiles
  add constraint sticker_profiles_display_name_chars_ck
  check (display_name = btrim(display_name)
         and display_name !~ '[\x01-\x1F\x7F-\x9F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]')
  not valid;

-- Column level privileges: is_admin is only exposed through sticker_is_admin(),
-- created_at is not needed by the app (data minimisation). Users may only
-- update display_name. (Table level REVOKE ALL also removes earlier column grants.)
revoke all on public.sticker_profiles from anon, authenticated;
grant select (id, display_name) on public.sticker_profiles to anon, authenticated;
grant update (display_name) on public.sticker_profiles to authenticated;

-- The SELECT policy is created after sticker_designs (it references that table).

drop policy if exists "sticker_profiles own update" on public.sticker_profiles;
create policy "sticker_profiles own update"
  on public.sticker_profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Belt and braces: even if privileges are changed later, API roles can never
-- flip is_admin. (The SQL editor / service role run as other roles and may.)
create or replace function public.sticker_profiles_guard_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and current_user in ('anon', 'authenticated') then
    raise exception 'forbidden';
  end if;
  return new;
end;
$$;

drop trigger if exists sticker_profiles_guard_admin on public.sticker_profiles;
create trigger sticker_profiles_guard_admin
  before update on public.sticker_profiles
  for each row execute function public.sticker_profiles_guard_admin();

revoke all on function public.sticker_profiles_guard_admin() from public, anon, authenticated;

-- Create a gallery profile on signup. Only the explicit 'display_name' metadata
-- is used (never the real name delivered by Discord/Google, to protect minors).
-- Must NEVER fail: an exception here would abort the signup itself. Invalid
-- metadata is cleaned up, and if the insert still violates a check constraint
-- the generated fallback name is used.
create or replace function public.sticker_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fallback text := 'user-' || substr(replace(new.id::text, '-', ''), 1, 6);
  v_name     text;
begin
  v_name := regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    '[\x01-\x1F\x7F-\x9F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]', '', 'g');
  -- trim again after cutting: left() may end on a blank
  v_name := btrim(left(btrim(v_name), 24));
  if char_length(v_name) < 2 then
    v_name := v_fallback;
  end if;
  begin
    insert into public.sticker_profiles (id, display_name)
    values (new.id, v_name)
    on conflict (id) do nothing;
  exception when check_violation then
    insert into public.sticker_profiles (id, display_name)
    values (new.id, v_fallback)
    on conflict (id) do nothing;
  end;
  return new;
end;
$$;

revoke all on function public.sticker_handle_new_user() from public, anon, authenticated;

drop trigger if exists sticker_on_auth_user_created on auth.users;
create trigger sticker_on_auth_user_created
  after insert on auth.users
  for each row execute function public.sticker_handle_new_user();

-- Backfill for users that signed up before this migration.
insert into public.sticker_profiles (id, display_name)
select u.id, 'user-' || substr(replace(u.id::text, '-', ''), 1, 6)
from auth.users u
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- sticker_designs
-- ---------------------------------------------------------------------------

create table if not exists public.sticker_designs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.sticker_profiles (id) on delete cascade,
  title          text not null check (char_length(btrim(title)) between 1 and 60),
  template_id    text not null check (char_length(template_id) between 1 and 60),
  project_path   text not null,
  thumb_path     text not null,
  status         text not null default 'pending'
                 check (status in ('pending', 'published', 'hidden', 'rejected')),
  like_count     integer not null default 0 check (like_count >= 0),
  report_count   integer not null default 0 check (report_count >= 0),
  download_count integer not null default 0 check (download_count >= 0),
  created_at     timestamptz not null default now(),
  published_at   timestamptz,
  -- Files must live in the uploader's own folder (checked again by storage policies).
  constraint sticker_designs_project_path_ck check (project_path = user_id::text || '/' || id::text || '/project.json'),
  constraint sticker_designs_thumb_path_ck   check (thumb_path   = user_id::text || '/' || id::text || '/thumb.webp')
);

create index if not exists sticker_designs_status_new_idx on public.sticker_designs (status, published_at desc);
create index if not exists sticker_designs_status_top_idx on public.sticker_designs (status, like_count desc, published_at desc);
create index if not exists sticker_designs_template_idx   on public.sticker_designs (template_id);
create index if not exists sticker_designs_user_idx       on public.sticker_designs (user_id, created_at desc);

alter table public.sticker_designs drop constraint if exists sticker_designs_title_chars_ck;
alter table public.sticker_designs
  add constraint sticker_designs_title_chars_ck
  check (title !~ '[\x01-\x1F\x7F-\x9F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]')
  not valid;

alter table public.sticker_designs enable row level security;

revoke all on public.sticker_designs from anon, authenticated;
grant select on public.sticker_designs to anon, authenticated;
grant insert (id, user_id, title, template_id, project_path, thumb_path, status) on public.sticker_designs to authenticated;
grant delete on public.sticker_designs to authenticated;
-- No UPDATE privilege on purpose: status changes go through sticker_admin_set_status().

drop policy if exists "sticker_designs public read" on public.sticker_designs;
create policy "sticker_designs public read"
  on public.sticker_designs for select
  to anon, authenticated
  using (status = 'published' or user_id = (select auth.uid()) or public.sticker_is_admin((select auth.uid())));

drop policy if exists "sticker_designs insert own pending" on public.sticker_designs;
create policy "sticker_designs insert own pending"
  on public.sticker_designs for insert
  to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');

drop policy if exists "sticker_designs delete own" on public.sticker_designs;
create policy "sticker_designs delete own"
  on public.sticker_designs for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Profiles are only readable where the app needs them: the own profile,
-- creators of published designs, and everything for admins. Accounts without
-- published designs cannot be enumerated through the API.
drop policy if exists "sticker_profiles are readable" on public.sticker_profiles;
create policy "sticker_profiles are readable"
  on public.sticker_profiles for select
  to anon, authenticated
  using (
    id = (select auth.uid())
    or public.sticker_is_admin((select auth.uid()))
    or exists (
      select 1 from public.sticker_designs d
      where d.user_id = sticker_profiles.id and d.status = 'published'
    )
  );

-- Per-user upload log. Kept separate from sticker_designs so that deleting
-- designs does not reset the rate limit. Not accessible to API roles at all.
create table if not exists public.sticker_upload_log (
  user_id    uuid not null references public.sticker_profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists sticker_upload_log_user_idx on public.sticker_upload_log (user_id, created_at desc);
alter table public.sticker_upload_log enable row level security;
revoke all on public.sticker_upload_log from anon, authenticated;

-- Before insert: rate limit (10 uploads / 24 h) and server-side file checks.
-- The client uploads the two files first, then inserts the row; this trigger
-- verifies both files exist and respect the size limits
-- (project <= 8 MB, thumbnail <= 300 KB).
create or replace function public.sticker_designs_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent       integer;
  v_project_size bigint;
  v_thumb_size   bigint;
  v_project_mime text;
  v_thumb_mime   text;
begin
  select count(*) into v_recent
  from public.sticker_upload_log l
  where l.user_id = new.user_id and l.created_at > now() - interval '24 hours';
  if v_recent >= 10 then
    raise exception 'rate_limit';
  end if;

  select (o.metadata ->> 'size')::bigint, o.metadata ->> 'mimetype'
  into v_project_size, v_project_mime
  from storage.objects o
  where o.bucket_id = 'sticker-gallery' and o.name = new.project_path;

  select (o.metadata ->> 'size')::bigint, o.metadata ->> 'mimetype'
  into v_thumb_size, v_thumb_mime
  from storage.objects o
  where o.bucket_id = 'sticker-gallery' and o.name = new.thumb_path;

  if v_project_size is null or v_thumb_size is null then
    raise exception 'files_missing';
  end if;
  if v_project_size > 8 * 1024 * 1024 or v_thumb_size > 300 * 1024 then
    raise exception 'file_too_large';
  end if;
  -- The bucket only allows these two types, but not which file gets which.
  if lower(btrim(split_part(coalesce(v_project_mime, ''), ';', 1))) <> 'application/json'
     or lower(btrim(split_part(coalesce(v_thumb_mime, ''), ';', 1))) <> 'image/webp' then
    raise exception 'invalid_input';
  end if;

  insert into public.sticker_upload_log (user_id) values (new.user_id);
  return new;
end;
$$;

revoke all on function public.sticker_designs_before_insert() from public, anon, authenticated;

drop trigger if exists sticker_designs_before_insert on public.sticker_designs;
create trigger sticker_designs_before_insert
  before insert on public.sticker_designs
  for each row execute function public.sticker_designs_before_insert();


-- ---------------------------------------------------------------------------
-- sticker_likes
-- ---------------------------------------------------------------------------

create table if not exists public.sticker_likes (
  user_id    uuid not null references public.sticker_profiles (id) on delete cascade,
  design_id  uuid not null references public.sticker_designs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, design_id)
);
create index if not exists sticker_likes_design_idx on public.sticker_likes (design_id);

alter table public.sticker_likes enable row level security;

revoke all on public.sticker_likes from anon, authenticated;
grant select, insert, delete on public.sticker_likes to authenticated;

drop policy if exists "sticker_likes read own" on public.sticker_likes;
create policy "sticker_likes read own"
  on public.sticker_likes for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "sticker_likes insert own" on public.sticker_likes;
create policy "sticker_likes insert own"
  on public.sticker_likes for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.sticker_designs d
      where d.id = sticker_likes.design_id and d.status = 'published'
    )
  );

drop policy if exists "sticker_likes delete own" on public.sticker_likes;
create policy "sticker_likes delete own"
  on public.sticker_likes for delete
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.sticker_likes_update_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.sticker_designs set like_count = like_count + 1 where id = new.design_id;
  elsif tg_op = 'DELETE' then
    update public.sticker_designs set like_count = greatest(like_count - 1, 0) where id = old.design_id;
  end if;
  return null;
end;
$$;

revoke all on function public.sticker_likes_update_count() from public, anon, authenticated;

drop trigger if exists sticker_likes_update_count on public.sticker_likes;
create trigger sticker_likes_update_count
  after insert or delete on public.sticker_likes
  for each row execute function public.sticker_likes_update_count();


-- ---------------------------------------------------------------------------
-- sticker_reports (notice & action, DSA Art. 16). Reporting works WITHOUT login.
-- Column layout follows the common moderation pattern
-- (description, moderator_id, moderator_note, resolved_at).
-- ---------------------------------------------------------------------------

create table if not exists public.sticker_reports (
  id             uuid primary key default gen_random_uuid(),
  design_id      uuid not null references public.sticker_designs (id) on delete cascade,
  reporter_id    uuid references auth.users (id) on delete set null,
  reason         text not null
                 check (reason in ('copyright', 'trademark', 'inappropriate', 'personal_data', 'spam', 'other')),
  description    text check (description is null or char_length(description) <= 1000),
  contact_email  text check (contact_email is null or char_length(contact_email) <= 200),
  status         text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  moderator_id   uuid references auth.users (id) on delete set null,
  moderator_note text check (moderator_note is null or char_length(moderator_note) <= 1000),
  resolved_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists sticker_reports_design_idx on public.sticker_reports (design_id, status);
create index if not exists sticker_reports_status_idx on public.sticker_reports (status, created_at desc);

alter table public.sticker_reports enable row level security;

revoke all on public.sticker_reports from anon, authenticated;
grant select on public.sticker_reports to authenticated;
-- Inserts only via sticker_report_design(); updates only via sticker_admin_resolve_report().

drop policy if exists "sticker_reports admin read" on public.sticker_reports;
create policy "sticker_reports admin read"
  on public.sticker_reports for select
  to authenticated
  using (public.sticker_is_admin((select auth.uid())));

create or replace function public.sticker_report_design(
  p_design_id     uuid,
  p_reason        text,
  p_description   text default null,
  p_contact_email text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_desc     text := nullif(btrim(coalesce(p_description, '')), '');
  v_email    text := nullif(btrim(coalesce(p_contact_email, '')), '');
  v_distinct integer;
begin
  -- Input validation (reports must be substantiated, DSA Art. 16(2)).
  if p_reason is null
     or p_reason not in ('copyright', 'trademark', 'inappropriate', 'personal_data', 'spam', 'other') then
    raise exception 'invalid_input';
  end if;
  if v_desc is null or char_length(v_desc) < 10 or char_length(v_desc) > 1000 then
    raise exception 'invalid_input';
  end if;
  if v_email is not null
     and (char_length(v_email) > 200 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'invalid_input';
  end if;

  if not exists (select 1 from public.sticker_designs d where d.id = p_design_id and d.status = 'published') then
    raise exception 'not_found';
  end if;

  -- Abuse brakes.
  if v_uid is not null then
    if exists (
      select 1 from public.sticker_reports r
      where r.design_id = p_design_id and r.reporter_id = v_uid and r.status = 'open'
    ) then
      raise exception 'already_reported';
    end if;
    if (select count(*) from public.sticker_reports r
        where r.reporter_id = v_uid and r.created_at > now() - interval '1 hour') >= 20 then
      raise exception 'rate_limit';
    end if;
  else
    if (select count(*) from public.sticker_reports r
        where r.design_id = p_design_id and r.reporter_id is null and r.status = 'open') >= 5 then
      raise exception 'already_reported';
    end if;
    if (select count(*) from public.sticker_reports r
        where r.reporter_id is null and r.created_at > now() - interval '1 hour') >= 100 then
      raise exception 'rate_limit';
    end if;
  end if;

  insert into public.sticker_reports (design_id, reporter_id, reason, description, contact_email)
  values (p_design_id, v_uid, p_reason, v_desc, v_email);

  -- Auto-hide: >= 3 open reports from DIFFERENT signed-in users.
  select count(distinct r.reporter_id) into v_distinct
  from public.sticker_reports r
  where r.design_id = p_design_id and r.status = 'open' and r.reporter_id is not null;

  update public.sticker_designs d
  set report_count = (select count(*) from public.sticker_reports r where r.design_id = p_design_id and r.status = 'open'),
      status = case when d.status = 'published' and v_distinct >= 3 then 'hidden' else d.status end
  where d.id = p_design_id;
end;
$$;

revoke all on function public.sticker_report_design(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.sticker_report_design(uuid, text, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- Other RPCs
-- ---------------------------------------------------------------------------

create or replace function public.sticker_increment_download(p_design_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.sticker_designs
  set download_count = download_count + 1
  where id = p_design_id and status = 'published';
$$;

revoke all on function public.sticker_increment_download(uuid) from public, anon, authenticated;
grant execute on function public.sticker_increment_download(uuid) to anon, authenticated;

create or replace function public.sticker_admin_set_status(p_design_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sticker_is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;
  if p_status is null or p_status not in ('pending', 'published', 'hidden', 'rejected') then
    raise exception 'invalid_input';
  end if;

  update public.sticker_designs d
  set status = p_status,
      published_at = case
        when p_status = 'published' then coalesce(d.published_at, now())
        else d.published_at
      end
  where d.id = p_design_id;

  -- Re-publishing is an explicit decision on the open reports: close them,
  -- otherwise the next report would immediately hide the design again.
  if p_status = 'published' then
    update public.sticker_reports
    set status = 'dismissed',
        moderator_id = auth.uid(),
        moderator_note = coalesce(moderator_note, 'design re-published'),
        resolved_at = now()
    where design_id = p_design_id and status = 'open';
    update public.sticker_designs set report_count = 0 where id = p_design_id;
  end if;
end;
$$;

revoke all on function public.sticker_admin_set_status(uuid, text) from public, anon, authenticated;
grant execute on function public.sticker_admin_set_status(uuid, text) to authenticated;

create or replace function public.sticker_admin_resolve_report(
  p_report_id uuid,
  p_status    text,
  p_note      text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_design uuid;
begin
  if not public.sticker_is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;
  if p_status is null or p_status not in ('resolved', 'dismissed') then
    raise exception 'invalid_input';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'invalid_input';
  end if;

  update public.sticker_reports
  set status = p_status,
      moderator_id = auth.uid(),
      moderator_note = nullif(btrim(coalesce(p_note, '')), ''),
      resolved_at = now()
  where id = p_report_id
  returning design_id into v_design;

  if v_design is not null then
    update public.sticker_designs
    set report_count = (select count(*) from public.sticker_reports r where r.design_id = v_design and r.status = 'open')
    where id = v_design;
  end if;
end;
$$;

revoke all on function public.sticker_admin_resolve_report(uuid, text, text) from public, anon, authenticated;
grant execute on function public.sticker_admin_resolve_report(uuid, text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- Storage: bucket 'sticker-gallery'
--   <user_id>/<design_id>/project.json   (application/json, <= 8 MB)
--   <user_id>/<design_id>/thumb.webp     (image/webp, thumbnail <= 300 KB,
--                                         verified by sticker_designs_before_insert)
-- The bucket-wide limit is 8 MB; the stricter thumbnail limit is enforced by
-- the trigger above (storage buckets only support one size limit).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sticker-gallery', 'sticker-gallery', true, 8388608, array['application/json', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- True when a design row already references the folder of this object
-- (<user_id>/<design_id>/...). From that moment the files belong to the
-- moderated design and the uploader can neither add nor delete files there;
-- otherwise "delete + upload again" would swap content after approval.
create or replace function public.sticker_storage_claimed(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_part text := split_part(coalesce(p_name, ''), '/', 2);
begin
  if v_part !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return exists (select 1 from public.sticker_designs d where d.id = v_part::uuid);
end;
$$;

revoke all on function public.sticker_storage_claimed(text) from public, anon, authenticated;
grant execute on function public.sticker_storage_claimed(text) to authenticated;

-- Upload check for the caller (storage INSERT policy):
--   * path <own uid>/<uuid>/(project.json|thumb.webp)
--   * folder not yet claimed by a design row (see above)
--   * at most 24 new objects per 24 h (10 designs x 2 files + retries)
--   * at most 4 files without a design row ("orphans") per 24 h, so the public
--     bucket cannot be used as free file hosting without going through moderation.
-- Objects that were deleted again (failed upload cleaned up) do not count.
create or replace function public.sticker_storage_upload_ok(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_prefix text;
begin
  if v_uid is null
     or p_name is null
     or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(project\.json|thumb\.webp)$'
     or split_part(p_name, '/', 1) <> v_uid::text then
    return false;
  end if;

  if public.sticker_storage_claimed(p_name) then
    return false;
  end if;

  v_prefix := v_uid::text || '/%';

  if (select count(*) from storage.objects o
      where o.bucket_id = 'sticker-gallery'
        and o.name like v_prefix
        and o.created_at > now() - interval '24 hours') >= 24 then
    return false;
  end if;

  if (select count(*) from storage.objects o
      where o.bucket_id = 'sticker-gallery'
        and o.name like v_prefix
        and o.created_at > now() - interval '24 hours'
        and not exists (
          select 1 from public.sticker_designs d
          where d.user_id = v_uid and (d.project_path = o.name or d.thumb_path = o.name)
        )) >= 4 then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.sticker_storage_upload_ok(text) from public, anon, authenticated;
grant execute on function public.sticker_storage_upload_ok(text) to authenticated;

drop policy if exists "sticker-gallery: owner or admin can list" on storage.objects;
create policy "sticker-gallery: owner or admin can list"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'sticker-gallery'
    and ((storage.foldername(name))[1] = (select auth.uid()::text) or public.sticker_is_admin((select auth.uid())))
  );

drop policy if exists "sticker-gallery: upload into own folder" on storage.objects;
create policy "sticker-gallery: upload into own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'sticker-gallery'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and public.sticker_storage_upload_ok(name)
  );

-- Owners may only delete files that are not (or no longer) referenced by a
-- design row: cleanup after a failed upload, or after deleting the design
-- (the app deletes the row first). Admins may delete everything (reject).
drop policy if exists "sticker-gallery: delete own files" on storage.objects;
create policy "sticker-gallery: delete own files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'sticker-gallery'
    and (
      public.sticker_is_admin((select auth.uid()))
      or ((storage.foldername(name))[1] = (select auth.uid()::text) and not public.sticker_storage_claimed(name))
    )
  );
-- No UPDATE policy: files are never overwritten (upsert needs UPDATE).

-- Replaced by sticker_storage_upload_ok(text) (earlier version of this migration).
drop function if exists public.sticker_storage_quota_ok();
