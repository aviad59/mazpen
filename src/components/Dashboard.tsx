import * as React from "react";
import { AlertCircle, CalendarClock, CheckCircle2, FileText, Send, Stamp } from "lucide-react";
import { DiscussionCard } from "./DiscussionCard";
import { SectionHeader } from "./SectionHeader";
import { EmptyState } from "./ui/EmptyState";
import { useStore } from "@/store/useStore";
import { SECTION_HINT, SECTION_LABEL, T } from "@/lib/he";
import { byCreatedDesc, byDateAsc } from "@/lib/utils";
import type { DashboardSection, Discussion } from "@/types";

interface Props {
  onOpenDiscussion: (id: string) => void;
}

const SECTION_ICON: Record<DashboardSection, React.ReactNode> = {
  requires_scheduling: <AlertCircle size={28} />,
  upcoming: <CalendarClock size={28} />,
  waiting_summary: <FileText size={28} />,
  waiting_approval: <Stamp size={28} />,
  waiting_distribution: <Send size={28} />,
  completed: <CheckCircle2 size={28} />,
};

function bucketize(discussions: Discussion[]) {
  const buckets: Record<DashboardSection, Discussion[]> = {
    requires_scheduling: [],
    upcoming: [],
    waiting_summary: [],
    waiting_approval: [],
    waiting_distribution: [],
    completed: [],
  };
  for (const d of discussions) {
    if (d.status === "cancelled") continue;
    if (d.status === "requires_scheduling") buckets.requires_scheduling.push(d);
    else if (d.status === "scheduled") buckets.upcoming.push(d);
    else if (d.status === "occurred" || d.status === "waiting_summary")
      buckets.waiting_summary.push(d);
    else if (d.status === "waiting_approval") buckets.waiting_approval.push(d);
    else if (d.status === "waiting_distribution") buckets.waiting_distribution.push(d);
    else if (d.status === "completed") buckets.completed.push(d);
  }
  buckets.requires_scheduling.sort(byCreatedDesc);
  buckets.upcoming.sort(byDateAsc);
  buckets.waiting_summary.sort(byCreatedDesc);
  buckets.waiting_approval.sort(byCreatedDesc);
  buckets.waiting_distribution.sort(byCreatedDesc);
  buckets.completed.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  return buckets;
}

export function Dashboard({ onOpenDiscussion }: Props) {
  const { discussions, lookupParticipant, loaded } = useStore();
  const buckets = React.useMemo(() => bucketize(discussions), [discussions]);

  if (!loaded) {
    return (
      <div className="px-3 py-12">
        <EmptyState
          title="טוען נתונים..."
          hint="מאחזר דיונים מהמכשיר"
        />
      </div>
    );
  }

  const isAllEmpty = Object.values(buckets).every((b) => b.length === 0);

  if (isAllEmpty) {
    return (
      <div className="px-3 py-12">
        <EmptyState
          icon={<CalendarClock size={48} />}
          title="הכל ריק"
          hint="הוסף דיון ראשון כדי להתחיל לעקוב."
        />
      </div>
    );
  }

  const sections: { key: DashboardSection; alert?: boolean; limit?: number }[] = [
    { key: "requires_scheduling", alert: true },
    { key: "upcoming" },
    { key: "waiting_summary" },
    { key: "waiting_approval" },
    { key: "waiting_distribution" },
    { key: "completed", limit: 5 },
  ];

  return (
    <div className="space-y-1 px-3 pb-24">
      {sections.map(({ key, alert, limit }) => {
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
                    compact={key === "completed"}
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
