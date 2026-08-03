import { useSyncExternalStore } from "react";
import type { DiscussionRequest } from "@/types";
import { listRequests, putRequest, deleteRequest } from "@/lib/requestsDb";
import { uid } from "@/lib/utils";

interface RequestState {
  requests: DiscussionRequest[];
  loading: boolean;
  error: string | null;
}

let state: RequestState = { requests: [], loading: false, error: null };
const listeners = new Set<() => void>();

function setState(next: Partial<RequestState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

let loadPromise: Promise<void> | null = null;

export async function loadRequestData() {
  if (loadPromise) return loadPromise;
  setState({ loading: true, error: null });
  loadPromise = listRequests()
    .then((requests) => setState({ requests, loading: false }))
    .catch((e) => {
      setState({ loading: false, error: String(e) });
      loadPromise = null;
    });
  return loadPromise;
}

export async function refreshRequests() {
  listRequests()
    .then((requests) => setState({ requests }))
    .catch(() => {});
}

export async function approveRequest(id: string): Promise<void> {
  const r = state.requests.find((x) => x.id === id);
  if (!r) return;
  const updated: DiscussionRequest = { ...r, status: "approved", updatedAt: new Date().toISOString() };
  await putRequest(updated);
  setState({ requests: state.requests.map((x) => (x.id === id ? updated : x)) });
}

export async function rejectRequest(id: string): Promise<void> {
  const r = state.requests.find((x) => x.id === id);
  if (!r) return;
  const updated: DiscussionRequest = { ...r, status: "rejected", updatedAt: new Date().toISOString() };
  await putRequest(updated);
  setState({ requests: state.requests.map((x) => (x.id === id ? updated : x)) });
}

export async function updateRequest(id: string, patch: Partial<Pick<DiscussionRequest, "title" | "notes" | "participantIds" | "requesterName">>): Promise<void> {
  const r = state.requests.find((x) => x.id === id);
  if (!r) return;
  const updated: DiscussionRequest = { ...r, ...patch, updatedAt: new Date().toISOString() };
  await putRequest(updated);
  setState({ requests: state.requests.map((x) => (x.id === id ? updated : x)) });
}

export async function removeRequest(id: string): Promise<void> {
  await deleteRequest(id);
  setState({ requests: state.requests.filter((x) => x.id !== id) });
}

export async function submitDiscussionRequest(input: {
  title: string;
  requesterName: string;
  notes?: string;
  participantIds: string[];
}): Promise<void> {
  const now = new Date().toISOString();
  const r: DiscussionRequest = {
    id: uid("req-"),
    title: input.title.trim(),
    requesterName: input.requesterName.trim(),
    notes: input.notes?.trim() || undefined,
    participantIds: input.participantIds,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  await putRequest(r);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return state;
}

export function useRequestStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
