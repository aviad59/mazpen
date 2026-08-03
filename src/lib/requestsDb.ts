import { supabase } from "./supabaseClient";
import type { DiscussionRequest, RequestStatus } from "@/types";

interface RequestRow {
  id: string;
  title: string;
  requester_name: string;
  notes: string | null;
  participant_ids: string[];
  status: RequestStatus;
  created_at: string;
  updated_at: string;
}

function fromRow(r: RequestRow): DiscussionRequest {
  return {
    id: r.id,
    title: r.title,
    requesterName: r.requester_name,
    notes: r.notes ?? undefined,
    participantIds: r.participant_ids ?? [],
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toRow(r: DiscussionRequest): RequestRow {
  return {
    id: r.id,
    title: r.title,
    requester_name: r.requesterName,
    notes: r.notes ?? null,
    participant_ids: r.participantIds,
    status: r.status,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

export async function listRequests(): Promise<DiscussionRequest[]> {
  const { data, error } = await supabase
    .from("discussion_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as RequestRow[]).map(fromRow);
}

export async function putRequest(r: DiscussionRequest): Promise<void> {
  const { error } = await supabase.from("discussion_requests").upsert(toRow(r));
  if (error) throw error;
}

export async function deleteRequest(id: string): Promise<void> {
  const { error } = await supabase.from("discussion_requests").delete().eq("id", id);
  if (error) throw error;
}

export async function listParticipantsPublic(): Promise<{ id: string; name: string; role: string | null; unit: string | null }[]> {
  const { data, error } = await supabase
    .from("participants")
    .select("id, name, role, unit")
    .order("name");
  if (error) throw error;
  return data as { id: string; name: string; role: string | null; unit: string | null }[];
}
