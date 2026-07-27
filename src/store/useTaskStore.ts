import { useSyncExternalStore, useCallback } from "react";
import type { Profile, Task } from "@/types";
import { listProfiles, listTasks, putTask, deleteTask as dbDeleteTask } from "@/lib/tasksDb";
import { uid } from "@/lib/utils";

interface TaskState {
  tasks: Task[];
  profiles: Profile[];
  loading: boolean;
  error: string | null;
}

let state: TaskState = { tasks: [], profiles: [], loading: false, error: null };
const listeners = new Set<() => void>();

function setState(next: Partial<TaskState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

let loadPromise: Promise<void> | null = null;

export async function loadTaskData() {
  if (loadPromise) return loadPromise;
  setState({ loading: true, error: null });
  loadPromise = Promise.all([listTasks(), listProfiles()])
    .then(([tasks, profiles]) => setState({ tasks, profiles, loading: false }))
    .catch((e) => {
      setState({ loading: false, error: String(e) });
      loadPromise = null;
    });
  return loadPromise;
}

export async function createTask(input: { title: string; description?: string; responsibleId?: string }) {
  const now = new Date().toISOString();
  const t: Task = {
    id: uid("task-"),
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    responsibleId: input.responsibleId,
    done: false,
    createdAt: now,
    updatedAt: now,
  };
  await putTask(t);
  setState({ tasks: [t, ...state.tasks] });
  return t;
}

export async function updateTask(id: string, patch: Partial<Pick<Task, "title" | "description" | "responsibleId" | "done">>) {
  const current = state.tasks.find((t) => t.id === id);
  if (!current) return;
  const updated: Task = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await putTask(updated);
  setState({ tasks: state.tasks.map((t) => (t.id === id ? updated : t)) });
}

export async function removeTask(id: string) {
  await dbDeleteTask(id);
  setState({ tasks: state.tasks.filter((t) => t.id !== id) });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return state;
}

export function useTaskStore() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const toggleDone = useCallback((id: string) => {
    const t = state.tasks.find((t) => t.id === id);
    if (t) updateTask(id, { done: !t.done });
  }, []);
  return { ...snap, toggleDone, createTask, updateTask, removeTask };
}
