-- ============================================================
-- Matzpen Commander — Supabase / Postgres schema
-- Run this in the Supabase SQL editor (or `psql`) once,
-- then set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.
-- ============================================================

create table if not exists public.participants (
  id           text primary key,
  name         text not null,
  role         text,
  unit         text,
  external     boolean not null default false
);

create table if not exists public.participant_groups (
  id               text primary key,
  name             text not null,
  participant_ids  text[] not null default array[]::text[]
);

create table if not exists public.discussions (
  id                      text primary key,
  name                    text not null,
  status                  text not null,
  date_window             text not null default 'unspecified',
  scheduled_week          text,
  participant_ids         text[] not null default array[]::text[],
  extra_participants      text[],
  leader_id               text not null,
  requires_summary        boolean not null default true,
  requires_substrate      boolean not null default true,
  recurrence              text not null default 'none',
  duration_minutes        integer,
  notes                   text,
  summary                 text,
  history                 jsonb not null default '[]'::jsonb,
  created_at              timestamptz not null,
  updated_at              timestamptz not null
);

-- Migration for DBs that ran an earlier version of this schema:
alter table public.discussions drop column if exists priority;
alter table public.discussions drop column if exists attachments;
alter table public.discussions
  add column if not exists requires_substrate boolean not null default true;
alter table public.discussions
  add column if not exists recurrence text not null default 'none';
alter table public.discussions
  add column if not exists scheduled_week text;
alter table public.discussions
  add column if not exists duration_minutes integer;
alter table public.discussions
  alter column leader_id set not null;

create index if not exists discussions_status_idx      on public.discussions (status);
create index if not exists discussions_date_window_idx on public.discussions (date_window);

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
alter table public.participants        enable row level security;
alter table public.participant_groups  enable row level security;
alter table public.discussions         enable row level security;

-- Drop old anon policies
drop policy if exists "anon read participants"   on public.participants;
drop policy if exists "anon write participants"  on public.participants;
drop policy if exists "anon read discussions"    on public.discussions;
drop policy if exists "anon write discussions"   on public.discussions;

-- Authenticated user policies for participants
create policy "auth read participants"
  on public.participants for select
  to authenticated
  using (true);

create policy "auth write participants"
  on public.participants for all
  to authenticated
  using (true)
  with check (true);

-- Authenticated user policies for participant_groups
create policy "auth read participant_groups"
  on public.participant_groups for select
  to authenticated
  using (true);

create policy "auth write participant_groups"
  on public.participant_groups for all
  to authenticated
  using (true)
  with check (true);

-- Authenticated user policies for discussions
create policy "auth read discussions"
  on public.discussions for select
  to authenticated
  using (true);

create policy "auth write discussions"
  on public.discussions for all
  to authenticated
  using (true)
  with check (true);

-- ------------------------------------------------------------
-- Push subscriptions (for PWA notifications)
-- ------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Users can only manage their own subscriptions
create policy "own push subscriptions"
  on public.push_subscriptions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Edge function (service_role) can read all subscriptions to send notifications
-- (service_role bypasses RLS by default — no extra policy needed)
