/**
 * Public DB facade — thin wrappers that delegate to the Supabase Repository.
 * Components and the store import only from here.
 */

import type { Discussion, Participant, ParticipantGroup } from "@/types";
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

export function deleteParticipantById(id: string): Promise<void> {
  return getRepo().deleteParticipant(id);
}

export function listGroups(): Promise<ParticipantGroup[]> {
  return getRepo().listGroups();
}

export function putGroup(g: ParticipantGroup): Promise<void> {
  return getRepo().putGroup(g);
}

export function deleteGroupById(id: string): Promise<void> {
  return getRepo().deleteGroup(id);
}

/** Wipes ALL data (discussions + participants). No re-seed. */
export function clearAllData(): Promise<void> {
  return getRepo().reset();
}
