/**
 * Global app store — a tiny custom store built on useSyncExternalStore.
 * Persists to Supabase via @/lib/db.
 */

import { useSyncExternalStore, useCallback, useMemo } from "react";
import type {
  DateWindow,
  Discussion,
  DiscussionStatus,
  HistoryEvent,
  HistoryKind,
  Participant,
} from "@/types";
import {
  clearAllData,
  deleteDiscussion as dbDelete,
  deleteParticipantById,
  listDiscussions,
  listParticipants,
  putDiscussion as dbPut,
  putParticipant as dbPutParticipant,
} from "@/lib/db";
import { isBackendConfigured } from "@/lib/repo";
import { WINDOW_LABEL } from "@/lib/he";
import { uid } from "@/lib/utils";

interface State {
  loaded: boolean;
  error: string | null;
  discussions: Discussion[];
  participants: Participant[];
}

let state: State = {
  loaded: false,
  error: null,
  discussions: [],
  participants: [],
};
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setState(updater: (prev: State) => State) {
  state = updater(state);
  emit();
}

async function load() {
  if (!isBackendConfigured) {
    setState(() => ({
      loaded: false,
      error:
        "Supabase לא הוגדר. הוסף VITE_SUPABASE_URL ו-VITE_SUPABASE_ANON_KEY לקובץ .env והפעל מחדש.",
      discussions: [],
      participants: [],
    }));
    return;
  }
  try {
    const [discussions, participants] = await Promise.all([
      listDiscussions(),
      listParticipants(),
    ]);
    setState(() => ({ loaded: true, error: null, discussions, participants }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setState((p) => ({ ...p, loaded: false, error: msg }));
  }
}

void load();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return state;
}

// ----- actions ---------------------------------------------------------

function buildEvent(
  kind: HistoryKind,
  text: string,
  meta?: Record<string, unknown>
): HistoryEvent {
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
  dateWindow?: DateWindow;
  participantIds?: string[];
  leaderId?: string | null;
  priority?: Discussion["priority"];
  requiresSummary?: boolean;
  notes?: string;
};

async function createDiscussion(input: CreateDiscussionInput): Promise<Discussion> {
  const nowIso = new Date().toISOString();
  const d: Discussion = {
    id: uid("disc-"),
    name: input.name.trim(),
    status: "scheduled",
    priority: input.priority ?? "normal",
    dateWindow: input.dateWindow ?? "this_week",
    participantIds: input.participantIds ?? [],
    leaderId: input.leaderId ?? null,
    requiresSummary: input.requiresSummary ?? true,
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

async function setDateWindow(id: string, w: DateWindow) {
  const current = state.discussions.find((d) => d.id === id);
  if (!current) return;
  if (current.dateWindow === w) return;
  await upsert(
    { ...current, dateWindow: w },
    buildEvent("window_changed", `מסגרת הזמן עודכנה ל"${WINDOW_LABEL[w]}"`, {
      from: current.dateWindow,
      to: w,
    })
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

async function updateParticipant(p: Participant): Promise<void> {
  await dbPutParticipant(p);
  setState((s) => ({
    ...s,
    participants: s.participants.map((x) => (x.id === p.id ? p : x)),
  }));
}

async function removeParticipant(id: string): Promise<void> {
  await deleteParticipantById(id);
  setState((s) => ({
    ...s,
    participants: s.participants.filter((x) => x.id !== id),
  }));
}

async function addNote(id: string, text: string) {
  const current = state.discussions.find((d) => d.id === id);
  if (!current || !text.trim()) return;
  await upsert(current, buildEvent("note", text.trim()));
}

async function clearAll() {
  await clearAllData();
  await load();
}

function statusLabelFor(s: DiscussionStatus): string {
  return (
    {
      scheduled: "מתוכנן",
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
    error: snap.error,
    discussions: snap.discussions,
    participants: snap.participants,
    lookupParticipant,
    createDiscussion,
    updateDiscussion,
    changeStatus,
    setDateWindow,
    removeDiscussion,
    addParticipant,
    updateParticipant,
    removeParticipant,
    addNote,
    clearAll,
    reload: load,
  };
}
