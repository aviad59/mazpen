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
  external     boolean not null default false,
  optional     boolean not null default false
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
  leader_id               text,
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
alter table public.participants
  add column if not exists optional boolean not null default false;
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
  alter column leader_id drop not null;
alter table public.discussions
  add column if not exists driving_time_preference boolean not null default false;
alter table public.discussions
  add column if not exists requires_bashi_review boolean not null default false;
alter table public.discussions
  add column if not exists important boolean not null default false;

create index if not exists discussions_status_idx      on public.discussions (status);
create index if not exists discussions_date_window_idx on public.discussions (date_window);

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
alter table public.participants        enable row level security;
alter table public.participant_groups  enable row level security;
alter table public.discussions         enable row level security;

-- All access policies live in supabase/security_hardening.sql
-- (access is restricted to users in public.allowed_emails).
-- ALWAYS run security_hardening.sql after this file.

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

-- Policies: see security_hardening.sql (own rows only, allowed users only).
-- Edge functions use service_role, which bypasses RLS.

-- ------------------------------------------------------------
-- Profiles (populated on each login so the user picker stays fresh)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email        text,
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Policies: see security_hardening.sql.

-- ------------------------------------------------------------
-- Tasks
-- ------------------------------------------------------------
create table if not exists public.tasks (
  id               text primary key,
  title            text not null,
  description      text,
  responsible_id   uuid references public.profiles(id) on delete set null,
  done             boolean not null default false,
  created_at       timestamptz not null,
  updated_at       timestamptz not null
);

alter table public.tasks enable row level security;

-- Policies: see security_hardening.sql.

-- ------------------------------------------------------------
-- Migrations
-- ------------------------------------------------------------
alter table public.discussions add column if not exists extra_participants text[];
alter table public.discussions add column if not exists optional_participant_ids text[];
alter table public.discussions add column if not exists cycles jsonb not null default '[]'::jsonb;

-- ------------------------------------------------------------
-- Discussion Requests (public form submissions)
-- ------------------------------------------------------------
create table if not exists public.discussion_requests (
  id               text primary key,
  title            text not null,
  requester_name   text not null,
  notes            text,
  participant_ids  text[] not null default array[]::text[],
  duration_minutes integer,
  status           text not null default 'pending',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- Migration: add duration_minutes if table already exists
alter table public.discussion_requests add column if not exists duration_minutes integer;

alter table public.discussion_requests enable row level security;

-- Policies (anon may submit; allowed users manage; anon reads only
-- participant id/name/role/unit): see security_hardening.sql.

-- ------------------------------------------------------------
-- Access control (replaces client-side allowlist)
-- ------------------------------------------------------------
create table if not exists public.allowed_emails (
  email text primary key
);

alter table public.allowed_emails enable row level security;

-- Policies (each user sees only their own row): see security_hardening.sql.

-- Add allowed users directly in the SQL editor (do NOT commit real emails —
-- this repository is public). Emails are matched case-insensitively.
--   insert into public.allowed_emails (email) values ('someone@example.com')
--   on conflict do nothing;

-- Add phone number to participants (safe to re-run)
alter table public.participants add column if not exists phone text;

-- Add aliases array to participants (safe to re-run)
alter table public.participants add column if not exists aliases text[] not null default array[]::text[];
