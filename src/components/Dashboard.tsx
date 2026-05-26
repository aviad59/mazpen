import * as React from "react";
import {
  CalendarRange,
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  Stamp,
} from "lucide-react";
import { DiscussionCard } from "./DiscussionCard";
import { SectionHeader } from "./SectionHeader";
import { EmptyState } from "./ui/EmptyState";
import { useStore } from "@/store/useStore";
import { SECTION_HINT, SECTION_LABEL, T } from "@/lib/he";
import { byCreatedDesc, effectiveScheduledSection } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { DashboardSection, Discussion } from "@/types";

interface Props {
  onOpenDiscussion: (id: string) => void;
}

// ---- Phase header divider ------------------------------------------------

interface PhaseHeaderProps {
  label: string;
  count: number;
  colorClass: string;   // text + border colour classes
  bgClass: string;      // pill background
}

function PhaseHeader({ label, count, colorClass, bgClass }: PhaseHeaderProps) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-3 pt-5 pb-1 px-1">
      <div className={cn("h-px flex-1 opacity-40", bgClass.replace("bg-", "bg-"))} />
      <span className={cn("text-[11px] font-bold tracking-widest px-3 py-1 rounded-full", colorClass, bgClass)}>
        {label}
        <span className="ms-1.5 opacity-60">{count}</span>
      </span>
      <div className={cn("h-px flex-1 opacity-40", bgClass.replace("bg-", "bg-"))} />
    </div>
  );
}

// ---- Date-window sub-sections inside the planning phase ------------------

const PLANNING_ICON: Record<DashboardSection, React.ReactNode> = {
  this_week: <CalendarRange size={28} />,
  next_week: <CalendarRange size={28} />,
  unspecified: <HelpCircle size={28} />,
  later: <Clock size={28} />,
  in_a_month: <Clock size={28} />,
  waiting_summary: <FileText size={28} />,
  waiting_approval: <Stamp size={28} />,
  distributed: <CheckCircle2 size={28} />,
};

const PLANNING_WINDOWS: DashboardSection[] = [
  "this_week",
  "next_week",
  "unspecified",
  "later",
  "in_a_month",
];

// ---- Bucketing -----------------------------------------------------------

interface Buckets {
  // planning phase: keyed by date-window section
  planning: Record<DashboardSection, Discussion[]>;
  // summary phase: occurred (requiresSummary) + waiting_summary
  summary: Discussion[];
  // approval phase
  approval: Discussion[];
  // done phase: distributed + occurred without requiresSummary
  done: Discussion[];
}

function bucketize(discussions: Discussion[]): Buckets {
  const planning: Record<DashboardSection, Discussion[]> = {
    this_week: [],
    next_week: [],
    unspecified: [],
    later: [],
    in_a_month: [],
    waiting_summary: [],
    waiting_approval: [],
    distributed: [],
  };
  const summary: Discussion[] = [];
  const approval: Discussion[] = [];
  const done: Discussion[] = [];

  for (const d of discussions) {
    if (d.status === "cancelled") continue;

    if (d.status === "new" || d.status === "coordinated") {
      const section = effectiveScheduledSection(d.dateWindow, d.scheduledWeek);
      planning[section].push(d);
    } else if (d.status === "occurred") {
      if (d.requiresSummary) {
        summary.push(d);
      } else {
        done.push(d);
      }
    } else if (d.status === "waiting_summary") {
      summary.push(d);
    } else if (d.status === "waiting_approval") {
      approval.push(d);
    } else if (d.status === "distributed") {
      done.push(d);
    }
  }

  PLANNING_WINDOWS.forEach((w) => planning[w].sort(byCreatedDesc));
  summary.sort(byCreatedDesc);
  approval.sort(byCreatedDesc);
  done.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return { planning, summary, approval, done };
}

// ---- Main component ------------------------------------------------------

export function Dashboard({ onOpenDiscussion }: Props) {
  const { discussions, lookupParticipant, loaded, isNewDiscussion } = useStore();
  const buckets = React.useMemo(() => bucketize(discussions), [discussions]);

  if (!loaded) {
    return (
      <div className="px-3 py-12">
        <EmptyState title="טוען נתונים..." hint="מתחבר לשרת" />
      </div>
    );
  }

  const planningCount = PLANNING_WINDOWS.reduce((n, w) => n + buckets.planning[w].length, 0);
  const isAllEmpty = planningCount === 0 && buckets.summary.length === 0 && buckets.approval.length === 0 && buckets.done.length === 0;

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

      {/* ── Phase 1: Planning ── */}
      <PhaseHeader
        label="בתכנון"
        count={planningCount}
        colorClass="text-blue-700 dark:text-blue-300"
        bgClass="bg-blue-100 dark:bg-blue-900"
      />
      {planningCount === 0 && (
        <EmptyState icon={<CalendarRange size={36} />} title="אין דיונים בתכנון" className="py-4" />
      )}
      {PLANNING_WINDOWS.map((w) => {
        const items = buckets.planning[w];
        return (
          <section key={w}>
            <SectionHeader
              title={SECTION_LABEL[w]}
              hint={items.length > 0 ? SECTION_HINT[w] : undefined}
              count={items.length}
              variant={w === "this_week" && items.length > 0 ? "alert" : "default"}
            />
            {items.length === 0 ? (
              <EmptyState icon={PLANNING_ICON[w]} title={T.empty[w]} className="py-3" />
            ) : (
              <div className="space-y-2">
                {items.map((d) => (
                  <DiscussionCard
                    key={d.id}
                    discussion={d}
                    lookupParticipant={lookupParticipant}
                    onOpen={onOpenDiscussion}
                    isNew={isNewDiscussion(d.id)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* ── Phase 2: Summary ── */}
      <PhaseHeader
        label="מחכה לסיכום"
        count={buckets.summary.length}
        colorClass="text-amber-700 dark:text-amber-300"
        bgClass="bg-amber-100 dark:bg-amber-900"
      />
      {buckets.summary.length > 0 && (
        <div className="space-y-2 pt-1">
          {buckets.summary.map((d) => (
            <DiscussionCard
              key={d.id}
              discussion={d}
              lookupParticipant={lookupParticipant}
              onOpen={onOpenDiscussion}
              isNew={isNewDiscussion(d.id)}
            />
          ))}
        </div>
      )}

      {/* ── Phase 3: Approval ── */}
      <PhaseHeader
        label="ממתין לאישור"
        count={buckets.approval.length}
        colorClass="text-violet-700 dark:text-violet-300"
        bgClass="bg-violet-100 dark:bg-violet-900"
      />
      {buckets.approval.length > 0 && (
        <div className="space-y-2 pt-1">
          {buckets.approval.map((d) => (
            <DiscussionCard
              key={d.id}
              discussion={d}
              lookupParticipant={lookupParticipant}
              onOpen={onOpenDiscussion}
              isNew={isNewDiscussion(d.id)}
            />
          ))}
        </div>
      )}

      {/* ── Phase 4: Done ── */}
      <PhaseHeader
        label="הסתיים"
        count={buckets.done.length}
        colorClass="text-emerald-700 dark:text-emerald-300"
        bgClass="bg-emerald-100 dark:bg-emerald-900"
      />
      {buckets.done.length > 0 && (
        <div className="space-y-2 pt-1">
          {buckets.done.slice(0, 5).map((d) => (
            <DiscussionCard
              key={d.id}
              discussion={d}
              lookupParticipant={lookupParticipant}
              onOpen={onOpenDiscussion}
              compact
              isNew={isNewDiscussion(d.id)}
            />
          ))}
        </div>
      )}

    </div>
  );
}
