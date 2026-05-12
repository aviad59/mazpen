/**
 * Core domain types for Matzpen Commander.
 * Comments are in English for maintainability; user-facing strings live in he.ts.
 */

export type DiscussionStatus =
  | "requires_scheduling"
  | "scheduled"
  | "occurred"
  | "waiting_summary"
  | "waiting_approval"
  | "waiting_distribution"
  | "completed"
  | "cancelled";

/**
 * Logical "section" buckets used on the operational dashboard.
 * A discussion's status maps directly to a section.
 */
export type DashboardSection =
  | "requires_scheduling"
  | "upcoming"
  | "waiting_summary"
  | "waiting_approval"
  | "waiting_distribution"
  | "completed";

export type Priority = "normal" | "high" | "urgent";

export interface Participant {
  id: string;
  name: string;
  /** Rank / role string e.g. "מג"ד", "סא"ל". Optional. */
  role?: string;
  unit?: string;
  external?: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  /** Optional data URL or remote URL. We only keep a reference, not the bytes (kept light). */
  url?: string;
  kind: "presentation" | "summary" | "file";
  addedAt: string;
}

export type HistoryKind =
  | "created"
  | "status_changed"
  | "date_changed"
  | "participants_changed"
  | "leader_changed"
  | "summary_changed"
  | "note"
  | "attachment_added";

export interface HistoryEvent {
  id: string;
  kind: HistoryKind;
  at: string; // ISO timestamp
  by?: string; // who made the change (free text)
  /** Short human-readable Hebrew description. */
  text: string;
  /** Optional structured payload e.g. { from, to } for status_changed */
  meta?: Record<string, unknown>;
}

export interface Discussion {
  id: string;
  name: string;
  status: DiscussionStatus;
  priority: Priority;

  /** ISO datetime when the discussion is scheduled to happen. null if unscheduled. */
  scheduledAt: string | null;
  /** Duration in minutes (optional). */
  durationMinutes?: number;

  /** Participant ids referencing the participants store. */
  participantIds: string[];
  /** Free-text external/manual participants if not in directory. */
  extraParticipants?: string[];
  /** ID of the discussion leader (one of participantIds). Optional. */
  leaderId?: string | null;

  /**
   * Whether this discussion requires a written summary.
   * When true, the discussion walks the full lifecycle:
   *   waiting_summary → waiting_approval → waiting_distribution → completed.
   * When false, occurrence completes the discussion immediately.
   */
  requiresSummary: boolean;

  /** Free text – topic, agenda, context. */
  notes?: string;

  /** Summary text (filled after meeting). */
  summary?: string;

  attachments: Attachment[];
  history: HistoryEvent[];

  createdAt: string;
  updatedAt: string;
}

export const STATUS_TO_SECTION: Record<DiscussionStatus, DashboardSection | "hidden"> = {
  requires_scheduling: "requires_scheduling",
  scheduled: "upcoming",
  occurred: "waiting_summary", // a meeting that happened sits in waiting-for-summary until processed
  waiting_summary: "waiting_summary",
  waiting_approval: "waiting_approval",
  waiting_distribution: "waiting_distribution",
  completed: "completed",
  cancelled: "hidden",
};
