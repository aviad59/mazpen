/**
 * Core domain types for Matzpen Commander.
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
  /** Rank / role string e.g. 'אל"ם · ראש מבצעים'. Optional. */
  role?: string;
  unit?: string;
  external?: boolean;
}

export interface Attachment {
  id: string;
  name: string;
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
  at: string;
  by?: string;
  text: string;
  meta?: Record<string, unknown>;
}

export interface Discussion {
  id: string;
  name: string;
  status: DiscussionStatus;
  priority: Priority;

  scheduledAt: string | null;
  durationMinutes?: number;

  participantIds: string[];
  extraParticipants?: string[];
  leaderId?: string | null;

  /**
   * Whether this discussion requires a written summary.
   * When true, the discussion walks the full lifecycle:
   *   waiting_summary → waiting_approval → waiting_distribution → completed.
   * When false, occurrence completes the discussion immediately.
   */
  requiresSummary: boolean;

  notes?: string;
  summary?: string;

  attachments: Attachment[];
  history: HistoryEvent[];

  createdAt: string;
  updatedAt: string;
}

export const STATUS_TO_SECTION: Record<DiscussionStatus, DashboardSection | "hidden"> = {
  requires_scheduling: "requires_scheduling",
  scheduled: "upcoming",
  occurred: "waiting_summary",
  waiting_summary: "waiting_summary",
  waiting_approval: "waiting_approval",
  waiting_distribution: "waiting_distribution",
  completed: "completed",
  cancelled: "hidden",
};
