import * as React from "react";
import {
  CalendarRange,
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  Send,
  Stamp,
} from "lucide-react";
import { DiscussionCard } from "./DiscussionCard";
import { SectionHeader } from "./SectionHeader";
import { EmptyState } from "./ui/EmptyState";
import { useStore } from "@/store/useStore";
import { SECTION_HINT, SECTION_LABEL, T } from "@/lib/he";
import { byCreatedDesc, effectiveScheduledSection } from "@/lib/utils";
import type { DashboardSection, Discussion } from "@/types";

interface Props {
  onOpenDiscussion: (id: string) => void;
}

const SECTION_ICON: Record<DashboardSection, React.ReactNode> = {
  this_week: <CalendarRange size={28} />,
  next_week: <CalendarRange size={28} />,
  unspecified: <HelpCircle size={28} />,
  later: <Clock size={28} />,
  waiting_summary: <FileText size={28} />,
  waiting_approval: <Stamp size={28} />,
  waiting_distribution: <Send size={28} />,
  completed: <CheckCircle2 size={28} />,
};

function bucketize(discussions: Discussion[]) {
  const buckets: Record<DashboardSection, Discussion[]> = {
    this_week: [],
    next_week: [],
    unspecified: [],
    later: [],
    waiting_summary: [],
    waiting_approval: [],
    waiting_distribution: [],
    completed: [],
  };
  for (const d of discussions) {
    if (d.status === "cancelled") continue;
    if (d.status === "scheduled") {
      // Compute section dynamically from scheduledWeek so it advances over time.
      const section = effectiveScheduledSection(d.dateWindow, d.scheduledWeek);
      buckets[section].push(d);
    } else if (d.status === "occurred" || d.status === "waiting_summary") {
      buckets.waiting_summary.push(d);
    } else if (d.status === "waiting_approval") {
      buckets.waiting_approval.push(d);
    } else if (d.status === "waiting_distribution") {
      buckets.waiting_distribution.push(d);
    } else if (d.status === "completed") {
      buckets.completed.push(d);
    }
  }

  // Sort each bucket
  buckets.this_week.sort(byCreatedDesc);
  buckets.next_week.sort(byCreatedDesc);
  buckets.unspecified.sort(byCreatedDesc);
  buckets.later.sort(byCreatedDesc);
  buckets.waiting_summary.sort(byCreatedDesc);
  buckets.waiting_approval.sort(byCreatedDesc);
  buckets.waiting_distribution.sort(byCreatedDesc);
  buckets.completed.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  return buckets;
}

/** Top-of-dashboard order — most operationally urgent first. */
const SECTIONS: { key: DashboardSection; alert?: boolean; limit?: number }[] = [
  { key: "this_week", alert: true },
  { key: "next_week" },
  { key: "unspecified" },
  { key: "waiting_summary" },
  { key: "waiting_approval" },
  { key: "waiting_distribution" },
  { key: "later" },
  { key: "completed", limit: 5 },
];

export function Dashboard({ onOpenDiscussion }: Props) {
  const { discussions, lookupParticipant, loaded } = useStore();
  const buckets = React.useMemo(() => bucketize(discussions), [discussions]);

  if (!loaded) {
    return (
      <div className="px-3 py-12">
        <EmptyState title="טוען נתונים..." hint="מתחבר לשרת" />
      </div>
    );
  }

  const isAllEmpty = Object.values(buckets).every((b) => b.length === 0);

  if (isAllEmpty) {
    return (
      <div className="px-3 py-12">
        <EmptyState
          icon={<CalendarRange size={48} />}
          title="הכל ריק"
          hint="הוסף דיון ראשון כדי להתחיל לעקוב."
        />
      </div>
    );
  }

  return (
    <div className="space-y-1 px-3 pb-24">
      {SECTIONS.map(({ key, alert, limit }) => {
        const items = limit ? buckets[key].slice(0, limit) : buckets[key];
        return (
          <section key={key}>
            <SectionHeader
              title={SECTION_LABEL[key]}
              hint={items.length > 0 ? SECTION_HINT[key] : undefined}
              count={items.length}
              variant={alert && items.length > 0 ? "alert" : "default"}
            />
            {items.length === 0 ? (
              <EmptyState
                icon={SECTION_ICON[key]}
                title={T.empty[key]}
                className="py-4"
              />
            ) : (
              <div className="space-y-2">
                {items.map((d) => (
                  <DiscussionCard
                    key={d.id}
                    discussion={d}
                    lookupParticipant={lookupParticipant}
                    onOpen={onOpenDiscussion}
                    compact={key === "completed" || key === "later"}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
