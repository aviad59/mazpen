import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { DateWindow, DashboardSection } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Generate a short unique ID without external deps. */
export function uid(prefix = ""): string {
  return (
    prefix +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

/** Format an ISO date into a Hebrew date label (no time). */
export function formatHebrewDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";

  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, today)) return "היום";
  if (sameDay(d, tomorrow)) return "מחר";

  return d.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "numeric",
    weekday: "long",
  });
}

/** Return a relative-time phrase in Hebrew. */
export function relativeTimeHe(iso: string): string {
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = target - now;
  const diffMin = Math.round(diffMs / 60000);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);

  if (Math.abs(diffMin) < 1) return "עכשיו";
  if (diffMin > 0 && diffMin < 60) return `בעוד ${diffMin} ד'`;
  if (diffMin < 0 && diffMin > -60) return `לפני ${-diffMin} ד'`;
  if (diffHr > 0 && diffHr < 24) return `בעוד ${diffHr} שע'`;
  if (diffHr < 0 && diffHr > -24) return `לפני ${-diffHr} שע'`;
  if (diffDay > 0) return `בעוד ${diffDay} ימים`;
  return `לפני ${-diffDay} ימים`;
}

/** Sort by createdAt descending. */
export function byCreatedDesc<T extends { createdAt: string }>(a: T, b: T) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/** Get the ISO Sunday date string for a given week offset from today (0 = this week). */
export function getWeekStart(offsetWeeks: number): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + offsetWeeks * 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/** Format a date as D.M (e.g. 24.5) */
function fmt(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

/** Return the date range string (Sunday–Thursday) for a dashboard section. */
export function sectionDateRange(section: DashboardSection): string | null {
  if (section === "this_week" || section === "next_week") {
    const offset = section === "this_week" ? 0 : 1;
    const sun = new Date(getWeekStart(offset) + "T00:00:00");
    const thu = new Date(sun); thu.setDate(sun.getDate() + 4);
    return `${fmt(sun)}–${fmt(thu)}`;
  }
  if (section === "later") {
    const sun = new Date(getWeekStart(2) + "T00:00:00");
    const thu = new Date(getWeekStart(3) + "T00:00:00"); thu.setDate(thu.getDate() + 4);
    return `${fmt(sun)}–${fmt(thu)}`;
  }
  if (section === "in_a_month") {
    const sun = new Date(getWeekStart(4) + "T00:00:00");
    return `מ-${fmt(sun)}`;
  }
  return null;
}

/**
 * Returns undefined for "unspecified".
 */
export function scheduledWeekForWindow(w: DateWindow): string | undefined {
  if (w === "this_week") return getWeekStart(0);
  if (w === "next_week") return getWeekStart(1);
  if (w === "later") return getWeekStart(2);
  if (w === "in_a_month") return getWeekStart(4);
  return undefined;
}

/**
 * Given a discussion's dateWindow and scheduledWeek (ISO date),
 * return which dashboard section it belongs to.
 */
export function effectiveScheduledSection(
  dateWindow: DateWindow,
  scheduledWeek: string | undefined
): DashboardSection {
  if (!scheduledWeek) return dateWindow === "unspecified" ? "unspecified" : (dateWindow as DashboardSection);

  const now = new Date();
  const sw = new Date(scheduledWeek);
  const diffDays = (sw.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays <= 0) return "this_week";
  if (diffDays <= 7) return "next_week";
  if (diffDays <= 28) return "later";
  return "in_a_month";
}
