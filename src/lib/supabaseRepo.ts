/**
 * Supabase-backed Repository implementation.
 * Talks to Postgres tables `discussions` and `participants` over PostgREST.
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import { supabase as sharedClient } from "./supabaseClient";
import type {
  DateWindow,
  Discussion,
  HistoryEvent,
  Participant,
  ParticipantGroup,
  Recurrence,
  DiscussionStatus,
} from "@/types";
import type { Repository } from "./repo";

// --- row shapes --------------------------------------------------------

interface DiscussionRow {
  id: string;
  name: string;
  status: DiscussionStatus;
  date_window: DateWindow;
  scheduled_week: string | null;
  participant_ids: string[];
  extra_participants: string[] | null;
  leader_id: string;
  requires_summary: boolean;
  requires_substrate: boolean;
  recurrence: Recurrence;
  duration_minutes: number | null;
  notes: string | null;
  summary: string | null;
  history: HistoryEvent[];
  created_at: string;
  updated_at: string;
}

interface ParticipantRow {
  id: string;
  name: string;
  role: string | null;
  unit: string | null;
  external: boolean;
}

interface ParticipantGroupRow {
  id: string;
  name: string;
  participant_ids: string[];
}

function fromDiscussionRow(r: DiscussionRow): Discussion {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    dateWindow: r.date_window ?? "unspecified",
    scheduledWeek: r.scheduled_week ?? undefined,
    participantIds: r.participant_ids ?? [],
    extraParticipants: r.extra_participants ?? undefined,
    leaderId: r.leader_id,
    requiresSummary: r.requires_summary,
    requiresSubstrate: r.requires_substrate ?? true,
    recurrence: r.recurrence ?? "none",
    durationMinutes: r.duration_minutes ?? undefined,
    notes: r.notes ?? undefined,
    summary: r.summary ?? undefined,
    history: r.history ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toDiscussionRow(d: Discussion): DiscussionRow {
  return {
    id: d.id,
    name: d.name,
    status: d.status,
    date_window: d.dateWindow,
    scheduled_week: d.scheduledWeek ?? null,
    participant_ids: d.participantIds,
    extra_participants: d.extraParticipants ?? null,
    leader_id: d.leaderId,
    requires_summary: d.requiresSummary,
    requires_substrate: d.requiresSubstrate,
    recurrence: d.recurrence,
    duration_minutes: d.durationMinutes ?? null,
    notes: d.notes ?? null,
    summary: d.summary ?? null,
    history: d.history,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

function fromParticipantRow(r: ParticipantRow): Participant {
  return {
    id: r.id,
    name: r.name,
    role: r.role ?? undefined,
    unit: r.unit ?? undefined,
    external: r.external ?? false,
  };
}

function toParticipantRow(p: Participant): ParticipantRow {
  return {
    id: p.id,
    name: p.name,
    role: p.role ?? null,
    unit: p.unit ?? null,
    external: !!p.external,
  };
}

function fromGroupRow(r: ParticipantGroupRow): ParticipantGroup {
  return { id: r.id, name: r.name, participantIds: r.participant_ids ?? [] };
}

function toGroupRow(g: ParticipantGroup): ParticipantGroupRow {
  return { id: g.id, name: g.name, participant_ids: g.participantIds };
}

// --- adapter -----------------------------------------------------------

export function createSupabaseRepo(_url: string, _anonKey: string): Repository {
  const client: SupabaseClient = sharedClient;

  return {
    kind: "supabase",

    async listDiscussions() {
      const { data, error } = await client.from("discussions").select(
        "id,name,status,date_window,scheduled_week,participant_ids,extra_participants,leader_id,requires_summary,requires_substrate,recurrence,duration_minutes,notes,summary,history,created_at,updated_at"
      );
      if (error) throw error;
      return (data as DiscussionRow[]).map(fromDiscussionRow);
    },

    async listParticipants() {
      const { data, error } = await client.from("participants").select("*");
      if (error) throw error;
      return (data as ParticipantRow[]).map(fromParticipantRow);
    },

    async listGroups() {
      const { data, error } = await client.from("participant_groups").select("*");
      if (error) throw error;
      return (data as ParticipantGroupRow[]).map(fromGroupRow);
    },

    async putDiscussion(d: Discussion): Promise<void> {
      const row = toDiscussionRow(d);
      const { error } = await client.from("discussions").upsert(row);
      if (error) throw error;
    },

    async deleteDiscussion(id: string): Promise<void> {
      const { error } = await client.from("discussions").delete().eq("id", id);
      if (error) throw error;
    },

    async putParticipant(p: Participant): Promise<void> {
      const row = toParticipantRow(p);
      const { error } = await client.from("participants").upsert(row);
      if (error) throw error;
    },

    async deleteParticipant(id: string): Promise<void> {
      const { error } = await client.from("participants").delete().eq("id", id);
      if (error) throw error;
    },

    async putGroup(g: ParticipantGroup): Promise<void> {
      const row = toGroupRow(g);
      const { error } = await client.from("participant_groups").upsert(row);
      if (error) throw error;
    },

    async deleteGroup(id: string): Promise<void> {
      const { error } = await client.from("participant_groups").delete().eq("id", id);
      if (error) throw error;
    },

    async reset(): Promise<void> {
      await client.from("discussions").delete().neq("id", "");
      await client.from("participants").delete().neq("id", "");
      await client.from("participant_groups").delete().neq("id", "");
    },
  };
}
