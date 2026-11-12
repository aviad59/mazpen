-- ============================================================
-- Security hardening — run once in the Supabase SQL editor.
-- Safe to re-run. Runs in a single transaction (all or nothing).
--
-- Fixes:
--  1. Every policy used to be `to authenticated using (true)`, and the email
--     allow-list was enforced only in the browser. Any Google account could
--     sign in and read/write ALL data with the public anon key.
--     → All access now requires the caller's email to be in allowed_emails.
--  2. Anonymous visitors could read every participant's phone number and
--     aliases (needed only id/name/role/unit for the public request form).
--     → Anon can now read only those four columns.
--  3. Any signed-in user could list every allowed email.
--     → Users can only see their own allow-list row (what the app checks).
--  4. Anonymous request submissions had no limits.
--     → Must be status 'pending' with sane field lengths.
--
-- Does NOT touch auth sessions, JWT secrets or keys — nobody is signed out.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Helper: is the current user on the allow-list?
-- Reads the email from auth.users (by auth.uid()), not from client input.
-- Google sign-ins count as verified; email/password sign-ins must be confirmed.
-- ------------------------------------------------------------
create or replace function public.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.allowed_emails a on lower(a.email) = lower(u.email)
    where u.id = auth.uid()
      and (
        u.email_confirmed_at is not null
        or u.raw_app_meta_data ->> 'provider' = 'google'
      )
  );
$$;

revoke all on function public.is_allowed_user() from public, anon;
grant execute on function public.is_allowed_user() to authenticated;

-- ------------------------------------------------------------
-- Make sure RLS is on everywhere
-- ------------------------------------------------------------
alter table public.participants        enable row level security;
alter table public.participant_groups  enable row level security;
alter table public.discussions         enable row level security;
alter table public.tasks               enable row level security;
alter table public.profiles            enable row level security;
alter table public.push_subscriptions  enable row level security;
alter table public.discussion_requests enable row level security;
alter table public.allowed_emails      enable row level security;

-- ------------------------------------------------------------
-- Drop EVERY existing policy on these tables (including any created by hand
-- in the dashboard), so no leftover permissive policy keeps the door open.
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('participants', 'participant_groups', 'discussions', 'tasks',
                        'profiles', 'push_subscriptions', 'discussion_requests', 'allowed_emails')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ------------------------------------------------------------
-- Shared data: allow-listed users only
-- ------------------------------------------------------------
create policy "allowed users manage participants"
  on public.participants for all to authenticated
  using ((select public.is_allowed_user()))
  with check ((select public.is_allowed_user()));

create policy "allowed users manage participant_groups"
  on public.participant_groups for all to authenticated
  using ((select public.is_allowed_user()))
  with check ((select public.is_allowed_user()));

create policy "allowed users manage discussions"
  on public.discussions for all to authenticated
  using ((select public.is_allowed_user()))
  with check ((select public.is_allowed_user()));

create policy "allowed users manage tasks"
  on public.tasks for all to authenticated
  using ((select public.is_allowed_user()))
  with check ((select public.is_allowed_user()));

create policy "allowed users manage requests"
  on public.discussion_requests for all to authenticated
  using ((select public.is_allowed_user()))
  with check ((select public.is_allowed_user()));

-- ------------------------------------------------------------
-- Profiles: allowed users can read all; each user writes only their own
-- ------------------------------------------------------------
create policy "allowed users read profiles"
  on public.profiles for select to authenticated
  using ((select public.is_allowed_user()));

create policy "allowed users write own profile"
  on public.profiles for all to authenticated
  using (id = (select auth.uid()) and (select public.is_allowed_user()))
  with check (id = (select auth.uid()) and (select public.is_allowed_user()));

-- ------------------------------------------------------------
-- Push subscriptions: own rows only, allowed users only
-- ------------------------------------------------------------
create policy "allowed users manage own push subscriptions"
  on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed_user()));

-- ------------------------------------------------------------
-- Allow-list: a user may only see their own row (that's all the app checks)
-- ------------------------------------------------------------
create policy "users read own allow-list row"
  on public.allowed_emails for select to authenticated
  using (lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', '')));

revoke insert, update, delete, truncate on public.allowed_emails from anon, authenticated;

-- ------------------------------------------------------------
-- Public request form (anonymous)
-- ------------------------------------------------------------
-- Anon may read only the columns the form needs — no phone numbers / aliases.
revoke select on public.participants from anon;
grant  select (id, name, role, unit) on public.participants to anon;
revoke insert, update, delete, truncate on public.participants from anon;

create policy "anon read participants"
  on public.participants for select to anon
  using (true);

-- Anon may submit new requests only, with sane limits.
create policy "anon insert requests"
  on public.discussion_requests for insert to anon
  with check (
    status = 'pending'
    and char_length(title) between 1 and 300
    and char_length(requester_name) between 1 and 200
    and coalesce(char_length(notes), 0) <= 10000
    and coalesce(array_length(participant_ids, 1), 0) <= 200
  );

commit;

-- ------------------------------------------------------------
-- Verification (optional): run these after the migration.
-- ------------------------------------------------------------
-- Any public table WITHOUT row level security? (should return 0 rows)
--   select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
-- Every allowed email has a matching user that passes the check?
--   select a.email, u.id is not null as has_account,
--          (u.email_confirmed_at is not null or u.raw_app_meta_data->>'provider' = 'google') as passes
--   from public.allowed_emails a left join auth.users u on lower(u.email) = lower(a.email);
