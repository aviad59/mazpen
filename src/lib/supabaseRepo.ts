/**
 * Supabase-backed Repository implementation.
 * Talks to Postgres tables `discussions` and `participants` over PostgREST.
 *
 * Schema is in `supabase/schema.sql`. Setup is documented in the README.
 *
 * Notes:
 *   - We convert between camelCase TS (Discussion, Participant) and
 *     snake_case Postgres columns at the adapter boundary.
 *   - On first connect we seed the DB if both tables are empty.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Attachment,
  Discussion,
  HistoryEvent,
  Participant,
  Priority,
  DiscussionStatus,
} from "@/types";
import { SEED_DISCUSSIONS, SEED_PARTICIPANTS } from "./seed";
import type { Repository } from "./repo";

// --- row shapes --------------------------------------------------------

interface DiscussionRow {
  id: string;
  name: string;
  status: DiscussionStatus;
  priority: Priority;
  scheduled_at: string | null;
  duration_minutes: number | null;
  participant_ids: string[];
  extra_participants: string[] | null;
  leader_id: string | null;
  requires_summary: boolean;
  requires_approval: boolean;
  requires_distribution: boolean;
  notes: string | null;
  summary: string | null;
  attachments: Attachment[];
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

function fromDiscussionRow(r: DiscussionRow): Discussion {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    priority: r.priority,
    scheduledAt: r.scheduled_at,
    durationMinutes: r.duration_minutes ?? undefined,
    participantIds: r.participant_ids ?? [],
    extraParticipants: r.extra_participants ?? undefined,
    leaderId: r.leader_id ?? null,
    requiresSummary: r.requires_summary,
    requiresApproval: r.requires_approval,
    requiresDistribution: r.requires_distribution,
    notes: r.notes ?? undefined,
    summary: r.summary ?? undefined,
    attachments: r.attachments ?? [],
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
    priority: d.priority,
    scheduled_at: d.scheduledAt,
    duration_minutes: d.durationMinutes ?? null,
    participant_ids: d.participantIds,
    extra_participants: d.extraParticipants ?? null,
    leader_id: d.leaderId ?? null,
    requires_summary: d.requiresSummary,
    requires_approval: d.requiresApproval,
    requires_distribution: d.requiresDistribution,
    notes: d.notes ?? null,
    summary: d.summary ?? null,
    attachments: d.attachments,
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

// --- adapter -----------------------------------------------------------

export function createSupabaseRepo(url: string, anonKey: string): Repository {
  const client: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  });

  let seedAttempted = false;

  /** Seed on first run only if both tables are empty. */
  async function maybeSeed() {
    if (seedAttempted) return;
    seedAttempted = true;
    const [{ count: discCount }, { count: partCount }] = await Promise.all([
      client.from("discussions").select("id", { count: "exact", head: true }),
      client.from("participants").select("id", { count: "exact", head: true }),
    ]);
    if ((discCount ?? 0) === 0 && (partCount ?? 0) === 0) {
      await client
        .from("participants")
        .upsert(SEED_PARTICIPANTS.map(toParticipantRow));
      await client
        .from("discussions")
        .upsert(SEED_DISCUSSIONS.map(toDiscussionRow));
    }
  }

  return {
    kind: "supabase",

    async listDiscussions() {
      await maybeSeed();
      const { data, error } = await client.from("discussions").select("*");
      if (error) throw error;
      return (data as DiscussionRow[]).map(fromDiscussionRow);
    },

    async listParticipants() {
      await maybeSeed();
      const { data, error } = await client.from("participants").select("*");
      if (error) throw error;
      return (data as ParticipantRow[]).map(fromParticipantRow);
    },

    async putDiscussion(d) {
      const { error } = await client.from("discussions").upsert(toDiscussionRow(d));
      if (error) throw error;
    },

    async deleteDiscussion(id) {
      const { error } = await client.from("discussions").delete().eq("id", id);
      if (error) throw error;
    },

    async putParticipant(p) {
      const { error } = await client.from("participants").upsert(toParticipantRow(p));
      if (error) throw error;
    },

    async reset() {
      // Best-effort wipe + reseed.
      await client.from("discussions").delete().neq("id", "__noop__");
      await client.from("participants").delete().neq("id", "__noop__");
      seedAttempted = false;
      await maybeSeed();
    },
  };
}
