/**
 * Builds a human-readable Hebrew description of what changed when a
 * discussion's details are edited, for the activity log.
 */
import { RECURRENCE_LABEL } from "@/lib/he";
import type { Discussion, Participant } from "@/types";

function namesFor(ids: string[], lookupParticipant: (id: string) => Participant | undefined): string[] {
  return ids.map((id) => lookupParticipant(id)?.name ?? id);
}

/** Compares the current discussion against the patch about to be saved and
 *  returns a list of Hebrew sentences describing each change. */
export function describeChanges(
  before: Discussion,
  patch: Partial<Discussion>,
  lookupParticipant: (id: string) => Participant | undefined
): string[] {
  const changes: string[] = [];

  if (patch.name !== undefined && patch.name !== before.name) {
    changes.push(`שם הדיון שונה מ-"${before.name}" ל-"${patch.name}"`);
  }

  if (patch.participantIds !== undefined) {
    const beforeIds = before.participantIds;
    const afterIds = patch.participantIds;
    const added = afterIds.filter((id) => !beforeIds.includes(id));
    const removed = beforeIds.filter((id) => !afterIds.includes(id));
    if (added.length) changes.push(`נוספו משתתפים: ${namesFor(added, lookupParticipant).join(", ")}`);
    if (removed.length) changes.push(`הוסרו משתתפים: ${namesFor(removed, lookupParticipant).join(", ")}`);
  }

  if (patch.extraParticipants !== undefined || before.extraParticipants !== undefined) {
    const beforeExtra = before.extraParticipants ?? [];
    const afterExtra = patch.extraParticipants ?? [];
    const added = afterExtra.filter((n) => !beforeExtra.includes(n));
    const removed = beforeExtra.filter((n) => !afterExtra.includes(n));
    if (added.length) changes.push(`נוספו משתתפים זמניים: ${added.join(", ")}`);
    if (removed.length) changes.push(`הוסרו משתתפים זמניים: ${removed.join(", ")}`);
  }

  if (patch.optionalParticipantIds !== undefined || before.optionalParticipantIds !== undefined) {
    const beforeOpt = before.optionalParticipantIds ?? [];
    const afterOpt = patch.optionalParticipantIds ?? [];
    const added = afterOpt.filter((id) => !beforeOpt.includes(id));
    const removed = beforeOpt.filter((id) => !afterOpt.includes(id));
    if (added.length) changes.push(`סומנו כרשות: ${namesFor(added, lookupParticipant).join(", ")}`);
    if (removed.length) changes.push(`בוטל סימון רשות: ${namesFor(removed, lookupParticipant).join(", ")}`);
  }

  if ("leaderId" in patch && patch.leaderId !== before.leaderId) {
    const oldName = before.leaderId ? lookupParticipant(before.leaderId)?.name ?? before.leaderId : null;
    const newName = patch.leaderId ? lookupParticipant(patch.leaderId)?.name ?? patch.leaderId : null;
    if (oldName && newName) changes.push(`מוביל הדיון שונה מ-${oldName} ל-${newName}`);
    else if (newName) changes.push(`הוגדר מוביל: ${newName}`);
    else if (oldName) changes.push(`בוטל המוביל (היה ${oldName})`);
  }

  if (patch.requiresSummary !== undefined && patch.requiresSummary !== before.requiresSummary) {
    changes.push(`"דורש סיכום" ${patch.requiresSummary ? "הופעל" : "בוטל"}`);
  }

  if (patch.requiresSubstrate !== undefined && patch.requiresSubstrate !== before.requiresSubstrate) {
    changes.push(`"דורש מצע" ${patch.requiresSubstrate ? "הופעל" : "בוטל"}`);
  }

  if (patch.recurrence !== undefined && patch.recurrence !== before.recurrence) {
    changes.push(`תדירות שונתה מ-${RECURRENCE_LABEL[before.recurrence]} ל-${RECURRENCE_LABEL[patch.recurrence]}`);
  }

  if ("durationMinutes" in patch && patch.durationMinutes !== before.durationMinutes) {
    if (patch.durationMinutes === undefined) changes.push("משך הדיון הוסר");
    else if (before.durationMinutes === undefined) changes.push(`נקבע משך הדיון: ${patch.durationMinutes} דקות`);
    else changes.push(`משך הדיון שונה מ-${before.durationMinutes} ל-${patch.durationMinutes} דקות`);
  }

  if (patch.drivingTimePreference !== undefined && patch.drivingTimePreference !== (before.drivingTimePreference ?? false)) {
    changes.push(`"עדיפות לזמן נהיגה" ${patch.drivingTimePreference ? "הופעלה" : "בוטלה"}`);
  }

  if (patch.requiresBashiReview !== undefined && patch.requiresBashiReview !== (before.requiresBashiReview ?? false)) {
    changes.push(`"דורש מעבר של בשי" ${patch.requiresBashiReview ? "הופעל" : "בוטל"}`);
  }

  if ("notes" in patch && (patch.notes ?? "") !== (before.notes ?? "")) {
    changes.push("ההערות עודכנו");
  }

  return changes;
}
