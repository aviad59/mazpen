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
import { supabase } from "@/lib/supabaseClient";
import { WINDOW_LABEL, isPEDiscussion } from "@/lib/he";
import { uid, scheduledWeekForWindow } from "@/lib/utils";
import { getNotificationSettings } from "@/lib/notificationSettings";
import { scheduleNotification, cancelNotification } from "@/lib/notificationQueue";

/** Set by App.tsx whenever the auth user changes. Used to stamp HistoryEvents. */
let currentUserName = "";
export function setCurrentUserName(name: string) {
  currentUserName = name;
}

// ----- session "new discussion" tracking -----------------------------------
// On first load we compare the fetched IDs against what was stored in
// localStorage from the previous session. Any ID that was not known then is
// considered "new" and highlighted for the user until they close/refresh.

const STORAGE_KEY = "mazpen_known_discussion_ids";
let newDiscussionIds = new Set<string>();
let sessionInitialized = false;

function initSessionTracking(ids: string[]) {
  if (sessionInitialized) return;
  sessionInitialized = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const known = new Set<string>(JSON.parse(raw) as string[]);
      for (const id of ids) {
        if (!known.has(id)) newDiscussionIds.add(id);
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // localStorage unavailable -- skip silently
  }
}

export function isNewDiscussion(id: string): boolean {
  return newDiscussionIds.has(id);
}

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
    initSessionTracking(discussions.map((d) => d.id));
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
  return { id: uid("h-"), kind, at: new Date().toISOString(), by: currentUserName || undefined, text, meta };
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
  leaderId?: string;
  participantIds: string[];
  extraParticipants?: string[];
  optionalParticipantIds?: string[];
  dateWindow?: DateWindow;
  requiresSummary?: boolean;
  requiresSubstrate?: boolean;
  recurrence?: Discussion["recurrence"];
  durationMinutes?: number;
  notes?: string;
  drivingTimePreference?: boolean;
  requiresBashiReview?: boolean;
};

async function createDiscussion(input: CreateDiscussionInput): Promise<Discussion> {
  const isPE = isPEDiscussion(input.name);
  if (!isPE && !input.leaderId) throw new Error("חובה לבחור מוביל לדיון");
  if (input.leaderId && !input.participantIds.includes(input.leaderId)) throw new Error("המוביל חייב להיות אחד מהמשתתפים");
  const nowIso = new Date().toISOString();
  const resolvedWindow = input.dateWindow ?? "this_week";
  const d: Discussion = {
    id: uid("disc-"),
    name: input.name.trim(),
    status: "new",
    dateWindow: resolvedWindow,
    scheduledWeek: scheduledWeekForWindow(resolvedWindow),
    participantIds: input.participantIds,
    extraParticipants: input.extraParticipants,
    optionalParticipantIds: input.optionalParticipantIds,
    leaderId: input.leaderId,
    requiresSummary: input.requiresSummary ?? true,
    requiresSubstrate: input.requiresSubstrate ?? true,
    recurrence: input.recurrence ?? "none",
    durationMinutes: input.durationMinutes,
    notes: input.notes,
    drivingTimePreference: input.drivingTimePreference ?? false,
    requiresBashiReview: input.requiresBashiReview ?? false,
    history: [{ id: uid("h-"), kind: "created", at: nowIso, text: "הדיון נוצר", by: currentUserName || undefined }],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await dbPut(d);
  setState((p) => ({ ...p, discussions: [...p.discussions, d] }));

  // Notify other users via Edge Function — debounced, so creating and then
  // immediately deleting a discussion never sends a push.
  if (getNotificationSettings().notifyNewDiscussion) {
    scheduleNotification(`discussion:${d.id}`, () => {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        supabase.functions.invoke("notify-discussion", {
          body: { discussionName: d.name, creatorUserId: user.id },
        }).catch(() => { /* non-critical */ });
      });
    });
  }

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
    buildEvent("status_changed", `סטטוס: ${statusLabelFor(current.status)} ← ${statusLabelFor(to)}`, { from: current.status, to, by })
  );

  // Debounced — rapid status flips (or a flip immediately followed by a
  // delete) collapse into at most one push, reflecting the final status.
  if (getNotificationSettings().notifyStatusChange) {
    scheduleNotification(`status:${id}`, () => {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        supabase.functions.invoke("notify-status-change", {
          body: { discussionName: current.name, statusLabel: statusLabelFor(to), creatorUserId: user.id },
        }).catch(() => { /* non-critical */ });
      });
    });
  }
}

async function setDateWindow(id: string, w: DateWindow) {
  const current = state.discussions.find((d) => d.id === id);
  if (!current) return;
  if (current.dateWindow === w) return;
  await upsert(
    { ...current, dateWindow: w, scheduledWeek: scheduledWeekForWindow(w) },
    buildEvent("window_changed", `מסגרת זמן: ${WINDOW_LABEL[current.dateWindow]} ← ${WINDOW_LABEL[w]}`, { from: current.dateWindow, to: w })
  );
}

async function removeDiscussion(id: string) {
  cancelNotification(`discussion:${id}`);
  cancelNotification(`status:${id}`);
  await dbDelete(id);
  setState((p) => ({ ...p, discussions: p.discussions.filter((d) => d.id !== id) }));
}

async function addParticipant(p: Omit<Participant, "id">): Promise<Participant> {
  const full: Participant = { ...p, id: uid("p-") };
  await dbPutParticipant(full);
  setState((s) => ({ ...s, participants: [...s.participants, full] }));

  // Notify other users — debounced, same as discussions.
  scheduleNotification(`participant:${full.id}`, () => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.functions.invoke("notify-participant", {
        body: { participantName: full.name, creatorUserId: user.id },
      }).catch(() => { /* non-critical */ });
    });
  });

  return full;
}

async function updateParticipant(p: Participant): Promise<void> {
  await dbPutParticipant(p);
  setState((s) => ({ ...s, participants: s.participants.map((x) => (x.id === p.id ? p : x)) }));
}

async function removeParticipant(id: string): Promise<void> {
  cancelNotification(`participant:${id}`);
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
  const trimmed = text.trim();
  const newNotes = current.notes ? `${current.notes}
${trimmed}` : trimmed;
  await upsert({ ...current, notes: newNotes });
}

async function clearAll() {
  await clearAllData();
  await load();
}

function statusLabelFor(s: DiscussionStatus): string {
  const labels: Record<DiscussionStatus, string> = {
    new: "חדש",
    coordinated: "תואם",
    occurred: "התקיים",
    waiting_summary: "מחכה לסיכום",
    waiting_approval: "האם אושר סיכום",
    distributed: "הופץ",
    cancelled: "בוטל",
  };
  return labels[s] ?? s;
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
    isNewDiscussion,
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
