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
  ParticipantGroup,
} from "@/types";
import {
  clearAllData,
  deleteDiscussion as dbDelete,
  deleteGroupById,
  deleteParticipantById,
  listDiscussions,
  listGroups,
  listParticipants,
  putDiscussion as dbPut,
  putGroup as dbPutGroup,
  putParticipant as dbPutParticipant,
} from "@/lib/db";
import { isBackendConfigured } from "@/lib/repo";
import { WINDOW_LABEL } from "@/lib/he";
import { uid, scheduledWeekForWindow } from "@/lib/utils";

interface State {
  loaded: boolean;
  error: string | null;
  discussions: Discussion[];
  participants: Participant[];
  groups: ParticipantGroup[];
}

let state: State = {
  loaded: false,
  error: null,
  discussions: [],
  participants: [],
  groups: [],
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
      groups: [],
    }));
    return;
  }
  try {
    const [discussions, participants] = await Promise.all([
      listDiscussions(),
      listParticipants(),
    ]);
    const groups = await listGroups().catch(() => []);
    setState(() => ({ loaded: true, error: null, discussions, participants, groups }));
  } catch (e) {
    setState((p) => ({ ...p, loaded: false, error: formatError(e) }));
  }
}

function formatError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const obj = e as Record<string, unknown>;
    const parts = [obj.message, obj.details, obj.hint, obj.code]
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    if (parts.length > 0) return parts.join(" · ");
    try { return JSON.stringify(e); } catch { /* fall through */ }
  }
  return String(e);
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

function buildEvent(kind: HistoryKind, text: string, meta?: Record<string, unknown>): HistoryEvent {
  return { id: uid("h-"), kind, at: new Date().toISOString(), text, meta };
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
  leaderId: string;
  participantIds: string[];
  dateWindow?: DateWindow;
  requiresSummary?: boolean;
  requiresSubstrate?: boolean;
  recurrence?: Discussion["recurrence"];
  durationMinutes?: number;
  notes?: string;
};

async function createDiscussion(input: CreateDiscussionInput): Promise<Discussion> {
  if (!input.leaderId) throw new Error("חובה לבחור מוביל לדיון");
  if (!input.participantIds.includes(input.leaderId)) throw new Error("המוביל חייב להיות אחד מהמשתתפים");
  const nowIso = new Date().toISOString();
  const resolvedWindow = input.dateWindow ?? "this_week";
  const d: Discussion = {
    id: uid("disc-"),
    name: input.name.trim(),
    status: "scheduled",
    dateWindow: resolvedWindow,
    scheduledWeek: scheduledWeekForWindow(resolvedWindow),
    participantIds: input.participantIds,
    leaderId: input.leaderId,
    requiresSummary: input.requiresSummary ?? true,
    requiresSubstrate: input.requiresSubstrate ?? true,
    recurrence: input.recurrence ?? "none",
    durationMinutes: input.durationMinutes,
    notes: input.notes,
    history: [{ id: uid("h-"), kind: "created", at: nowIso, text: "הדיון נוצר", by: "מזכירות" }],
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
  const resolvedPatch =
    patch.dateWindow !== undefined && patch.scheduledWeek === undefined
      ? { ...patch, scheduledWeek: scheduledWeekForWindow(patch.dateWindow) }
      : patch;
  const merged: Discussion = { ...current, ...resolvedPatch };
  const evt = reason ? buildEvent(reason.kind, reason.text, reason.meta) : undefined;
  await upsert(merged, evt);
}

async function changeStatus(id: string, to: DiscussionStatus, by?: string) {
  const current = state.discussions.find((d) => d.id === id);
  if (!current) return;
  await upsert(
    { ...current, status: to },
    buildEvent("status_changed", `סטטוס שונה ל"${statusLabelFor(to)}"`, { from: current.status, to, by })
  );
}

async function setDateWindow(id: string, w: DateWindow) {
  const current = state.discussions.find((d) => d.id === id);
  if (!current) return;
  if (current.dateWindow === w) return;
  await upsert(
    { ...current, dateWindow: w, scheduledWeek: scheduledWeekForWindow(w) },
    buildEvent("window_changed", `מסגרת הזמן עודכנה ל"${WINDOW_LABEL[w]}"`, { from: current.dateWindow, to: w })
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
  setState((s) => ({ ...s, participants: s.participants.map((x) => (x.id === p.id ? p : x)) }));
}

async function removeParticipant(id: string): Promise<void> {
  await deleteParticipantById(id);
  setState((s) => ({ ...s, participants: s.participants.filter((x) => x.id !== id) }));
}

async function addGroup(g: Omit<ParticipantGroup, "id">): Promise<ParticipantGroup> {
  const full: ParticipantGroup = { ...g, id: uid("grp-") };
  await dbPutGroup(full);
  setState((s) => ({ ...s, groups: [...s.groups, full] }));
  return full;
}

async function updateGroup(g: ParticipantGroup): Promise<void> {
  await dbPutGroup(g);
  setState((s) => ({ ...s, groups: s.groups.map((x) => (x.id === g.id ? g : x)) }));
}

async function removeGroup(id: string): Promise<void> {
  await deleteGroupById(id);
  setState((s) => ({ ...s, groups: s.groups.filter((x) => x.id !== id) }));
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
  return ({
    scheduled: "מתוכנן", occurred: "התקיים", waiting_summary: "ממתין לסיכום",
    waiting_approval: "ממתין לאישור", waiting_distribution: "ממתין להפצה",
    completed: "הושלם", cancelled: "בוטל",
  } as Record<DiscussionStatus, string>)[s];
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
    groups: snap.groups,
    lookupParticipant,
    createDiscussion,
    updateDiscussion,
    changeStatus,
    setDateWindow,
    removeDiscussion,
    addParticipant,
    updateParticipant,
    removeParticipant,
    addGroup,
    updateGroup,
    removeGroup,
    addNote,
    clearAll,
    reload: load,
  };
}
