import { supabase } from "./supabaseClient";
import type { Profile, Task } from "@/types";

interface ProfileRow {
  id: string;
  display_name: string;
  email: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  responsible_id: string | null;
  done: boolean;
  created_at: string;
  updated_at: string;
}

function fromProfileRow(r: ProfileRow): Profile {
  return { id: r.id, displayName: r.display_name, email: r.email ?? undefined };
}

function fromTaskRow(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? undefined,
    responsibleId: r.responsible_id ?? undefined,
    done: r.done,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function upsertProfile(p: Profile): Promise<void> {
  const { error } = await supabase.from("profiles").upsert({
    id: p.id,
    display_name: p.displayName,
    email: p.email ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .order("display_name");
  if (error) throw error;
  return (data as ProfileRow[]).map(fromProfileRow);
}

export async function listTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, description, responsible_id, done, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as TaskRow[]).map(fromTaskRow);
}

export async function putTask(t: Task): Promise<void> {
  const { error } = await supabase.from("tasks").upsert({
    id: t.id,
    title: t.title,
    description: t.description ?? null,
    responsible_id: t.responsibleId ?? null,
    done: t.done,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  });
  if (error) throw error;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}
