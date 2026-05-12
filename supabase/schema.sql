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

create table if not exists public.discussions (
  id                      text primary key,
  name                    text not null,
  status                  text not null,
  priority                text not null default 'normal',
  scheduled_at            timestamptz,
  duration_minutes        int,
  participant_ids         text[] not null default array[]::text[],
  extra_participants      text[],
  leader_id               text,
  requires_summary        boolean not null default true,
  notes                   text,
  summary                 text,
  attachments             jsonb not null default '[]'::jsonb,
  history                 jsonb not null default '[]'::jsonb,
  created_at              timestamptz not null,
  updated_at              timestamptz not null
);

create index if not exists discussions_status_idx       on public.discussions (status);
create index if not exists discussions_scheduled_at_idx on public.discussions (scheduled_at);

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
-- The policies below are PERMISSIVE — anyone with the anon key
-- can read/write. That is fine for a closed-network deployment
-- behind a VPN, but if you expose this to the public internet,
-- replace with auth-gated policies and use Supabase auth.
-- ------------------------------------------------------------

alter table public.participants enable row level security;
alter table public.discussions  enable row level security;

drop policy if exists "anon read participants"  on public.participants;
drop policy if exists "anon write participants" on public.participants;
drop policy if exists "anon read discussions"   on public.discussions;
drop policy if exists "anon write discussions"  on public.discussions;

create policy "anon read participants"
  on public.participants for select using (true);
create policy "anon write participants"
  on public.participants for all
  using (true) with check (true);

create policy "anon read discussions"
  on public.discussions for select using (true);
create policy "anon write discussions"
  on public.discussions for all
  using (true) with check (true);
