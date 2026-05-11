/**
 * Hebrew user-facing strings — all UI text lives here for easy maintenance.
 */
import type { DashboardSection, DiscussionStatus, Priority } from "@/types";

export const APP_NAME = "מצפן";
export const APP_TAGLINE = "מעקב דיונים מבצעי";

export const STATUS_LABEL: Record<DiscussionStatus, string> = {
  requires_scheduling: "ממתין לתיאום",
  scheduled: "מתוזמן",
  occurred: "התקיים",
  waiting_summary: "ממתין לסיכום",
  waiting_approval: "ממתין לאישור",
  waiting_distribution: "ממתין להפצה",
  completed: "הושלם",
  cancelled: "בוטל",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  normal: "רגיל",
  high: "גבוהה",
  urgent: "דחוף",
};

export const SECTION_LABEL: Record<DashboardSection, string> = {
  requires_scheduling: "ממתינים לתיאום",
  upcoming: "דיונים קרובים",
  waiting_summary: "ממתינים לסיכום",
  waiting_approval: "ממתינים לאישור",
  waiting_distribution: "ממתינים להפצה",
  completed: "הושלמו לאחרונה",
};

export const SECTION_HINT: Record<DashboardSection, string> = {
  requires_scheduling: "חשוב לא לפספס — דיונים בלי תאריך",
  upcoming: "מה צפוי השבוע",
  waiting_summary: "כתיבת סיכום על-ידי מוביל הדיון",
  waiting_approval: "סיכומים שממתינים לאישור מפקד",
  waiting_distribution: "סיכומים מאושרים — להפיץ לנמענים",
  completed: "טופלו במלואם",
};

export const T = {
  newDiscussion: "דיון חדש",
  quickAdd: "הוספה מהירה",
  search: "חיפוש דיון, משתתף או דורש...",
  filters: "סינון",
  noResults: "לא נמצאו דיונים",
  noResultsHint: "נסה לשנות מסננים או להוסיף דיון חדש",
  notScheduled: "לא נקבע מועד",
  participants: "משתתפים",
  leader: "מוביל הדיון",
  requester: "מבקש הדיון",
  notes: "הערות / נושא",
  summary: "סיכום",
  attachments: "צרופות",
  history: "פעילות",
  cancel: "ביטול",
  save: "שמירה",
  create: "יצירה",
  delete: "מחיקה",
  edit: "עריכה",
  back: "חזרה",
  setDate: "קביעת מועד",
  markOccurred: "סמן כהתקיים",
  startSummary: "התחל סיכום",
  approveSummary: "אשר סיכום",
  markDistributed: "סמן כהופץ",
  reschedule: "תזמן מחדש",
  addParticipant: "הוסף משתתף",
  selectLeader: "בחר מוביל",
  selectRequester: "בחר מבקש",
  date: "תאריך",
  time: "שעה",
  duration: "משך (בדקות)",
  priority: "עדיפות",
  requiresSummary: "דורש סיכום",
  requiresApproval: "דורש אישור מפקד",
  requiresDistribution: "דורש הפצה",
  writeSummary: "כתוב סיכום...",
  addNote: "הוסף הערה...",
  addAttachment: "הוסף צרופה",
  empty: {
    requires_scheduling: "אין דיונים שממתינים לתיאום",
    upcoming: "אין דיונים קרובים",
    waiting_summary: "אין סיכומים פתוחים",
    waiting_approval: "אין סיכומים לאישור",
    waiting_distribution: "אין סיכומים להפצה",
    completed: "טרם הושלמו דיונים השבוע",
  },
  tabs: {
    dashboard: "לוח מבצעי",
    search: "חיפוש",
    add: "הוסף",
    archive: "ארכיון",
  },
};
