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
  date_window             text not null default 'unspecified',
  participant_ids         text[] not null default array[]::text[],
  extra_participants      text[],
  leader_id               text not null,
  requires_summary        boolean not null default true,
  requires_substrate      boolean not null default true,
  recurrence              text not null default 'none',
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
  alter column leader_id set not null;

create index if not exists discussions_status_idx      on public.discussions (status);
create index if not exists discussions_date_window_idx on public.discussions (date_window);

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
alter table public.participants enable row level security;
alter table public.discussions  enable row level security;

drop policy if exists "anon read participants"  on public.participants;
drop policy if exists "anon write participants" on public.participants;
drop policy if exists "anon read discussions"   on public.discussions;
drop policy if exists "anon write discussions"  on public.discussions;

create policy "anon read participants"
  on public.participants for selec