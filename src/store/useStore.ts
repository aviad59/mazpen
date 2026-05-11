/**
 * Global app store — a tiny custom store built on top of useSyncExternalStore.
 * Persists to IndexedDB and provides actions for discussion lifecycle changes.
 */

import { useSyncExternalStore, useCallback, useMemo } from "react";
import type {
  Discussion,
  DiscussionStatus,
  HistoryEvent,
  HistoryKind,
  Participant,
} from "@/types";
import {
  deleteDiscussion as dbDelete,
  listDiscussions,
  listParticipants,
  putDiscussion as dbPut,
  putParticipant as dbPutParticipant,
  resetAndReseed as dbReset,
} from "@/lib/db";
import { uid } from "@/lib/utils";

interface State {
  loaded: boolean;
  discussions: Discussion[];
  participants: Participant[];
}

let state: State = { loaded: false, discussions: [], participants: [] };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setState(updater: (prev: State) => State) {
  state = updater(state);
  emit();
}

async function load() {
  const [discussions, participants] = await Promise.all([
    listDiscussions(),
    listParticipants(),
  ]);
  setState(() => ({ loaded: true, discussions, participants }));
}

// kick off load once on first import
void load();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return state;
}

// ----- actions ---------------------------------------------------------

function buildEvent(kind: HistoryKind, text: string, meta?: Record<string, unknown>): HistoryEvent {
  return {
    id: uid("h-"),
    kind,
    at: new Date().toISOString(),
    text,
    meta,
  };
}

async function upsert(discussion: Discussion, event?: HistoryEvent) {
  const next: Discussion = {
    ...discussion,
    history: event ? [...discussion.history, event] : discussion.history,
    updatedAt: new Date().toISOString(),
  };
  await dbPut(next);
  setState((p) => {
    const exists = p.discussions.some((d) => d.id === next.id);
    return {
      ...p,
      discussions: exists
        ? p.discussions.map((d) => (d.id === next.id ? next : d))
        : [...p.discussions, next],
    };
  });
}

export type CreateDiscussionInput = {
  name: string;
  requester: string;
  scheduledAt?: string | null;
  participantIds?: string[];
  leaderId?: string | null;
  priority?: Discussion["priority"];
  requiresSummary?: boolean;
  requiresApproval?: boolean;
  requiresDistribution?: boolean;
  notes?: string;
  durationMinutes?: number;
};

async function createDiscussion(input: CreateDiscussionInput): Promise<Discussion> {
  const nowIso = new Date().toISOString();
  const d: Discussion = {
    id: uid("disc-"),
    name: input.name.trim(),
    requester: input.requester.trim(),
    status: input.scheduledAt ? "scheduled" : "requires_scheduling",
    priority: input.priority ?? "normal",
    scheduledAt: input.scheduledAt ?? null,
    durationMinutes: input.durationMinutes,
    participantIds: input.participantIds ?? [],
    leaderId: input.leaderId ?? null,
    requiresSummary: input.requiresSummary ?? true,
    requiresApproval: input.requiresApproval ?? false,
    requiresDistribution: input.requiresDistribution ?? false,
    notes: input.notes,
    attachments: [],
    history: [
      {
        id: uid("h-"),
        kind: "created",
        at: nowIso,
        text: "הדיון נוצר",
        by: "מזכירות",
      },
    ],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await dbPut(d);
  setState((p) => ({ ...p, discussions: [...p.discussions, d] }));
  return d;
}

async function updateDiscussion(
  id: string,
  patch: Partial<Discussion>,
  reason?: { kind: HistoryKind; text: string; meta?: Record<string, unknown> }
) {
  const current = state.discussions.find((d) => d.id === id);
  if (!current) return;
  const merged: Discussion = { ...current, ...patch };
  const evt = reason ? buildEvent(reason.kind, reason.text, reason.meta) : undefined;
  await upsert(merged, evt);
}

async function changeStatus(id: string, to: DiscussionStatus, by?: string) {
  const current = state.discussions.find((d) => d.id === id);
  if (!current) return;
  await upsert(
    { ...current, status: to },
    buildEvent("status_changed", `סטטוס שונה ל"${statusLabelFor(to)}"`, {
      from: current.status,
      to,
      by,
    })
  );
}

async function rescheduleDiscussion(id: string, newDateIso: string | null) {
  const current = state.discussions.find((d) => d.id === id);
  if (!current) return;
  const patch: Partial<Discussion> = {
    scheduledAt: newDateIso,
    status: newDateIso ? "scheduled" : "requires_scheduling",
  };
  await upsert(
    { ...current, ...patch },
    buildEvent(
      newDateIso ? "date_changed" : "status_changed",
      newDateIso ? "נקבע מועד חדש" : "המועד הוסר — חזרה לתיאום",
      { newDateIso }
    )
  );
}

async function removeDiscussion(id: string) {
  await dbDelete(id);
  setState((p) => ({ ...p, discussions: p.discussions.filter((d) => d.id !== id) }));
}

async function addParticipant(p: Omit<Participant, "id">): Promise<Participant> {
  const full: Participant = { ...p, id: uid("p-") };
  await dbPutParticipant(full);
  setState((s) => ({ ...s, participants: [...s.participants, full] }));
  return full;
}

async function addNote(id: string, text: string) {
  const current = state.discussions.find((d) => d.id === id);
  if (!current || !text.trim()) return;
  await upsert(current, buildEvent("note", text.trim()));
}

async function reseed() {
  await dbReset();
  await load();
}

// minimal label dictionary local to keep this module self-contained
function statusLabelFor(s: DiscussionStatus): string {
  return (
    {
      requires_scheduling: "ממתין לתיאום",
      scheduled: "מתוזמן",
      occurred: "התקיים",
      waiting_summary: "ממתין לסיכום",
      waiting_approval: "ממתין לאישור",
      waiting_distribution: "ממתין להפצה",
      completed: "הושלם",
      cancelled: "בוטל",
    } as Record<DiscussionStatus, string>
  )[s];
}

// ----- public hook -----------------------------------------------------

export function useStore() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const participantsById = useMemo(() => {
    const m = new Map<string, Participant>();
    snap.participants.forEach((p) => m.set(p.id, p));
    return m;
  }, [snap.participants]);

  const lookupParticipant = useCallback(
    (id: string) => participantsById.get(id),
    [participantsById]
  );

  return {
    loaded: snap.loaded,
    discussions: snap.discussions,
    participants: snap.participants,
    lookupParticipant,
    createDiscussion,
    updateDiscussion,
    changeStatus,
    rescheduleDiscussion,
    removeDiscussion,
    addParticipant,
    addNote,
    reseed,
  };
}
