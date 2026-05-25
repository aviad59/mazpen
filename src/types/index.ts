/**
 * Core domain types for Matzpen Commander.
 */

/**
 * Coarse scheduling window — the secretary picks a bucket, not a specific day.
 *  - this_week:  should happen this calendar week
 *  - next_week:  should happen next calendar week
 *  - later:      2 weeks to ~1 month out
 *  - in_a_month: beyond ~1 month
 *  - unspecified: not yet known / no urgency
 */
export type DateWindow = "this_week" | "next_week" | "later" | "in_a_month" | "unspecified";

/**
 * How often the discussion repeats. `none` is a one-off.
 * Recurrence is informational metadata — no auto-instance generation.
 */
export type Recurrence =
  | "none"
  | "twice_weekly"
  | "thrice_weekly"
  | "weekly"
  | "biweekly"
  | "triweekly"
  | "monthly";

export type DiscussionStatus =
  | "new"
  | "coordinated"
  | "occurred"
  | "waiting_summary"
  | "waiting_approval"
  | "distributed"
  | "cancelled";

/** Dashboard section keys — a mix of window buckets and post-meeting buckets. */
export type DashboardSection =
  | "this_week"
  | "next_week"
  | "unspecified"
  | "later"
  | "in_a_month"
  | "waiting_summary"
  | "waiting_approval"
  | "distributed";

export interface Participant {
  id: string;
  name: string;
  /** Title / role string e.g. 'אל"ם · ראש מבצעים'. */
  role?: string;
  /** Unit the participant belongs to. "מצפן" = home (internal). */
  unit?: string;
  external?: boolean;
}

export interface ParticipantGroup {
  id: string;
  name: string;
  participantIds: string[];
}

export type HistoryKind =
  | "created"
  | "status_changed"
  | "window_changed"
  | "participants_changed"
  | "leader_changed"
  | "summary_changed"
  | "note";

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

  /** When the discussion should happen — coarse bucket, not a specific date. */
  dateWindow: DateWindow;

  participantIds: string[];
  extraParticipants?: string[];
  /** Required — every discussion has a leader (defaults to the first participant). */
  leaderId: string;

  /**
   * Whether this discussion requires a written summary.
   * When true, the discussion walks the full lifecycle:
   *   waiting_summary → waiting_approval → waiting_distribution → completed.
   * When false, occurrence completes the discussion immediately.
   */
  requiresSummary: boolean;

  /** Whether this discussion needs a prep "מצע" (briefing material) before it occurs. */
  requiresSubstrate: boolean;

  /** How often the discussion repeats. Defaults to `none` (one-off). */
  recurrence: Recurrence;

  /**
   * The Monday (ISO date "YYYY-MM-DD") of the week when this discussion is scheduled.
   * Computed from `dateWindow` and stored for stable bucketing.
   */
  scheduledWeek?: string;

  /** Duration of the discussion in minutes (optional). */
  durationMinutes?: number;

  notes?: string;
  summary?: string;
  history: HistoryEvent[];
  createdAt: string;
  updatedAt: string;
}
