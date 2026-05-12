/**
 * Public DB facade — thin wrappers that delegate to the Supabase Repository.
 *
 * Components and the store import only from here.
 */

import type { Discussion, Participant } from "@/types";
import { getRepo } from "./repo";

export function listDiscussions(): Promise<Discussion[]> {
  return getRepo().listDiscussions();
}

export function listParticipants(): Promise<Participant[]> {
  return getRepo().listParticipants();
}

export function putDiscussion(d: Discussion): Promise<void> {
  return getRepo().putDiscussion(d);
}

export function deleteDiscussion(id: string): Promise<void> {
  return getRepo().deleteDiscussion(id);
}

export function putParticipant(p: Participant): Promise<void> {
  return getRepo().putParticipant(p);
}

export function resetAndReseed(): Promise<void> {
  return getRepo().reset();
}
