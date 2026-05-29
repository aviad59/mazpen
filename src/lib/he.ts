/**
 * Hebrew user-facing strings — all UI text lives here for easy maintenance.
 */
import type {
  DashboardSection,
  DateWindow,
  DiscussionStatus,
  Recurrence,
} from "@/types";

export const APP_NAME = "מצפן";
export const APP_TAGLINE = "מעקב דיונים מבצעי";

/** Home command name — participants with this unit are internal. */
export const HOME_UNIT = "מצפן";

/**
 * Returns true when a discussion name starts with פע / פ"ע / פא / פ"א
 * (both ASCII " and Hebrew ״ gershayim are accepted).
 * These discussions have no leader, no summary, and no substrate.
 */
export function isPEDiscussion(name: string): boolean {
  return /^פ["״]?[עא]/.test(name.trim());
}

export const STATUS_LABEL: Record<DiscussionStatus, string> = {
  new: "חדש",
  coordinated: "תואם",
  occurred: "התקיים",
  waiting_summary: "מחכה לסיכום",
  waiting_approval: "האם אושר סיכום",
  distributed: "הופץ",
  cancelled: "בוטל",
};

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: "חד-פעמי",
  twice_weekly: "פעמיים בשבוע",
  thrice_weekly: "שלוש פעמים בשבוע",
  weekly: "כל שבוע",
  biweekly: "כל שבועיים",
  triweekly: "כל שלושה שבועות",
  monthly: "כל חודש",
};

export const WINDOW_LABEL: Record<DateWindow, string> = {
  this_week: "השבוע",
  next_week: "שבוע הבא",
  later: "שבועיים עד חודש",
  in_a_month: "בעוד חודש",
  unspecified: "לא קבוע",
};

export const SECTION_LABEL: Record<DashboardSection, string> = {
  this_week: "השבוע",
  next_week: "שבוע הבא",
  unspecified: "לא קבוע",
  later: "שבועיים עד חודש",
  in_a_month: "בעוד חודש",
  waiting_summary: "מחכה לסיכום",
  waiting_approval: "האם אושר סיכום",
  distributed: "הופץ",
};

export const SECTION_HINT: Record<DashboardSection, string> = {
  this_week: "דיונים שצריכים להתקיים השבוע",
  next_week: "מה צפוי בשבוע הבא",
  unspecified: "טרם הוחלט מתי",
  later: "בין שבועיים לחודש מהיום",
  in_a_month: "מעבר לחודש מהיום",
  waiting_summary: "כתיבת סיכום על-ידי מוביל הדיון",
  waiting_approval: "סיכומים שממתינים לאישור מפקד",
  distributed: "סיכומים שהופצו — טופלו במלואם",
};

export const T = {
  newDiscussion: "דיון חדש",
  quickAdd: "הוספה מהירה",
  search: "חיפוש דיון, משתתף, תפקיד או יחידה...",
  filters: "סינון",
  noResults: "לא נמצאו דיונים",
  noResultsHint: "נסה לשנות מסננים או להוסיף דיון חדש",
  participants: "משתתפים",
  leader: "מוביל הדיון",
  externalUnits: "יחידות חיצוניות",
  hasExternals: "כולל משתתפים חיצוניים",
  notes: "הערות / נושא",
  history: "פעילות",
  cancel: "ביטול",
  save: "שמירה",
  create: "יצירה",
  delete: "מחיקה",
  edit: "עריכה",
  back: "חזרה",
  window: "מסגרת זמן",
  markCoordinated: "סמן כתואם",
  markOccurred: "סמן כהתקיים",
  startSummary: "התחל סיכום",
  approveSummary: "אשר סיכום",
  markDistributed: "סמן כהופץ",
  addParticipant: "הוסף משתתף",
  selectLeader: "בחר מוביל",
  requiresSummary: "דורש סיכום (כולל אישור והפצה)",
  requiresSubstrate: "האם צריך מצע",
  recurrence: "תדירות",
  addNote: "הוסף הערה...",
  empty: {
    this_week: "אין דיונים השבוע",
    next_week: "אין דיונים בשבוע הבא",
    unspecified: "אין דיונים ללא מסגרת זמן",
    later: "אין דיונים בטווח שבועיים עד חודש",
    in_a_month: "אין דיונים בעוד חודש",
    waiting_summary: "אין סיכומים פתוחים",
    waiting_approval: "אין סיכומים לאישור",
    distributed: "אין דיונים שהופצו",
  },
  tabs: {
    dashboard: "לוח מבצעי",
    search: "חיפוש",
    add: "הוסף",
    archive: "ארכיון",
  },
};
