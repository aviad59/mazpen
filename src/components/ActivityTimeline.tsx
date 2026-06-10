import type { HistoryEvent, HistoryKind } from "@/types";
import {
  CalendarRange,
  Edit3,
  FileText,
  MessageSquare,
  Plus,
  RefreshCw,
  Users,
  type LucideIcon,
} from "lucide-react";
import { relativeTimeHe } from "@/lib/utils";

const ICON_BY_KIND: Record<HistoryKind, LucideIcon> = {
  created: Plus,
  status_changed: RefreshCw,
  window_changed: CalendarRange,
  participants_changed: Users,
  leader_changed: Users,
  summary_changed: FileText,
  edited: Edit3,
  note: MessageSquare,
};

const KIND_LABEL: Record<HistoryKind, string> = {
  created: "נוצר",
  status_changed: "שינוי סטטוס",
  window_changed: "שינוי זמן",
  participants_changed: "משתתפים",
  leader_changed: "מוביל",
  summary_changed: "סיכום",
  edited: "עריכה",
  note: "הערה",
};

const KIND_COLOR: Record<HistoryKind, string> = {
  created: "text-blue-500 bg-blue-50 dark:bg-blue-950",
  status_changed: "text-violet-600 bg-violet-50 dark:bg-violet-950",
  window_changed: "text-amber-600 bg-amber-50 dark:bg-amber-950",
  participants_changed: "text-teal-600 bg-teal-50 dark:bg-teal-950",
  leader_changed: "text-teal-600 bg-teal-50 dark:bg-teal-950",
  summary_changed: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950",
  edited: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950",
  note: "text-muted-foreground bg-muted",
};

export function ActivityTimeline({ history }: { history: HistoryEvent[] }) {
  const sorted = [...history].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );

  if (sorted.length === 0) {
    return <p className="text-xs text-muted-foreground">אין פעילות עדיין.</p>;
  }

  return (
    <ol className="space-y-3 border-r-2 border-border pr-4 pt-1">
      {sorted.map((evt) => {
        const Icon: LucideIcon = ICON_BY_KIND[evt.kind] ?? Edit3;
        const colorClass = KIND_COLOR[evt.kind] ?? "text-muted-foreground bg-muted";
        return (
          <li key={evt.id} className="relative">
            <span className={`absolute -right-[1.4rem] top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-border ${colorClass}`}>
              <Icon size={11} />
            </span>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${colorClass}`}>
                  <Icon size={9} />
                  {KIND_LABEL[evt.kind]}
                </span>
                <time className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {relativeTimeHe(evt.at)}
                </time>
              </div>
              <p className="text-sm leading-snug whitespace-pre-line">{evt.text}</p>
              {evt.by && (
                <p className="text-xs text-muted-foreground">
                  בוצע על-ידי: <span className="font-medium text-foreground">{evt.by}</span>
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
