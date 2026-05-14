import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
