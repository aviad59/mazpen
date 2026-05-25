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
  note: MessageSquare,
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
        return (
          <li key={evt.id} className="relative">
            <span className="absolute -right-[1.4rem] top-1 flex h-5 w-5 items-center justify-center rounded-full bg-card border-2 border-border text-muted-foreground">
              <Icon size={11} />
            </span>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm">
                {evt.text}
                {evt.by && (
                  <span className="text-muted-foreground"> · {evt.by}</span>
                )}
              </p>
              <time className="text-[11px] text-muted-foreground whitespace-nowrap">
                {relativeTimeHe(evt.at)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
