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

// ---- Phase box wrapper ---------------------------------------------------

interface PhaseBoxProps {
  label: string;
  count: number;
  headerClass: string;  // bg color for the top strip
  borderClass: string;  // border color
  children: React.ReactNode;
}

function PhaseBox({ label, count, headerClass, borderClass, children }: PhaseBoxProps) {
  if (count === 0) return null;
  return (
    <div className={cn("rounded-xl border-2 overflow-hidden", borderClass)}>
      {/* Colored top strip */}
      <div className={cn("flex items-center justify-between px-4 py-2", headerClass)}>
        <span className="text-sm font-bold tracking-wide">{label}</span>
        <span className="text-xs font-semibold opacity-70 bg-white/20 rounded-full px-2 py-0.5">{count}</span>
      </div>
      {/* Content */}
      <div className="p-3 space-y-1 bg-background">
        {children}
      </div>
    </div>
  );
}

// ---- Icons ---------------------------------------------------------------

const WINDOW_ICON: Record<DashboardSection, React.ReactNode> = {
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
  planning: Record<DashboardSection, Discussion[]>;
  summary: Discussion[];
  approval: Discussion[];
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
      if (d.requiresSummary) { summary.push(d); } else { done.push(d); }
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
  const isAllEmpty =
    planningCount === 0 &&
    buckets.summary.length === 0 &&
    buckets.approval.length === 0 &&
    buckets.done.length === 0;

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
    <div className="space-y-4 px-3 pb-24 pt-3">

      {/* ── Phase 1: Planning ── */}
      <PhaseBox
        label="בתכנון"
        count={planningCount}
        headerClass="bg-blue-500 text-white"
        borderClass="border-blue-200 dark:border-blue-800"
      >
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
                <EmptyState icon={WINDOW_ICON[w]} title={T.empty[w]} className="py-3" />
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
      </PhaseBox>

      {/* ── Phase 2: Summary ── */}
      <PhaseBox
        label="מחכה לסיכום"
        count={buckets.summary.length}
        headerClass="bg-amber-500 text-white"
        borderClass="border-amber-200 dark:border-amber-800"
      >
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
      </PhaseBox>

      {/* ── Phase 3: Approval ── */}
      <PhaseBox
        label="ממתין לאישור"
        count={buckets.approval.length}
        headerClass="bg-violet-500 text-white"
        borderClass="border-violet-200 dark:border-violet-800"
      >
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
      </PhaseBox>

      {/* ── Phase 4: Done ── */}
      <PhaseBox
        label="הסתיים"
        count={buckets.done.length}
        headerClass="bg-emerald-500 text-white"
        borderClass="border-emerald-200 dark:border-emerald-800"
      >
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
      </PhaseBox>

    </div>
  );
}
