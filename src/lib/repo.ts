/**
 * Repository abstraction — single Supabase backend.
 *
 * The app talks to Postgres via @supabase/supabase-js. Both env vars
 * (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY) must be set in .env.
 *
 * If they aren't, `getRepo()` throws; the store catches the error and
 * the App shell renders a friendly "configure Supabase" screen.
 */

import type { Discussion, Participant, ParticipantGroup } from "@/types";
import { createSupabaseRepo } from "./supabaseRepo";

export interface Repository {
  readonly kind: "supabase";
  listDiscussions(): Promise<Discussion[]>;
  listParticipants(): Promise<Participant[]>;
  listGroups(): Promise<ParticipantGroup[]>;
  putDiscussion(d: Discussion): Promise<void>;
  deleteDiscussion(id: string): Promise<void>;
  putParticipant(p: Participant): Promise<void>;
  deleteParticipant(id: string): Promise<void>;
  putGroup(g: ParticipantGroup): Promise<void>;
  deleteGroup(id: string): Promise<void>;
  reset(): Promise<void>;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "חיבור ל-Supabase לא הוגדר — חסרים VITE_SUPABASE_URL ו/או VITE_SUPABASE_ANON_KEY בקובץ .env"
    );
    this.name = "SupabaseNotConfiguredError";
  }
}

let _repo: Repository | null = null;

export function getRepo(): Repository {
  if (_repo) return _repo;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new SupabaseNotConfiguredError();
  }
  _repo = createSupabaseRepo(SUPABASE_URL, SUPABASE_KEY);
  return _repo;
}

/** True when both env vars are present (the App can probe before using the repo). */
export const isBackendConfigured = !!(SUPABASE_URL && SUPABASE_KEY);
