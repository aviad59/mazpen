import * as React from "react";
import { CalendarRange, HelpCircle, Clock, ChevronDown } from "lucide-react";
import { DiscussionCard } from "./DiscussionCard";
import { SectionHeader } from "./SectionHeader";
import { EmptyState } from "./ui/EmptyState";
import { useStore } from "@/store/useStore";
import { SECTION_HINT, SECTION_LABEL, T } from "@/lib/he";
import { byCreatedDesc, effectiveScheduledSection, sectionDateRange } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { DashboardSection, Discussion } from "@/types";

interface Props {
  onOpenDiscussion: (id: string) => void;
}

// ---- Phase box wrapper (mobile) -----------------------------------------

interface PhaseBoxProps {
  label: string;
  count: number;
  headerClass: string;
  borderClass: string;
  children: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
}

function PhaseBox({ label, count, headerClass, borderClass, children, collapsed, onToggle }: PhaseBoxProps) {
  if (count === 0) return null;
  return (
    <div className={cn("rounded-xl border-2 overflow-hidden", borderClass)}>
      <button
        type="button"
        onClick={onToggle}
        className={cn("w-full flex items-center justify-between px-4 py-2 select-none", headerClass)}
      >
        <span className="text-sm font-bold tracking-wide">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold opacity-70 bg-white/20 rounded-full px-2 py-0.5">{count}</span>
          <ChevronDown
            size={15}
            className={cn("opacity-80 transition-transform duration-200", collapsed && "-rotate-90")}
          />
        </div>
      </button>
      {!collapsed && (
        <div className="p-3 space-y-1 bg-background">
          {children}
        </div>
      )}
    </div>
  );
}

// ---- Desktop kanban column -----------------------------------------------

interface KanbanColumnProps {
  label: string;
  count: number;
  headerClass: string;
  borderClass: string;
  emptyTitle: string;
  emptyIcon: React.ReactNode;
  children: React.ReactNode;
}

function KanbanColumn({ label, count, headerClass, borderClass, emptyTitle, emptyIcon, children }: KanbanColumnProps) {
  return (
    <div className={cn("flex-1 flex flex-col min-h-0 min-w-0 rounded-xl border-2 overflow-hidden", borderClass)}>
      <div className={cn("flex items-center justify-between px-4 py-2.5 shrink-0", headerClass)}>
        <span className="text-sm font-bold tracking-wide">{label}</span>
        <span className="text-xs font-semibold bg-white/20 rounded-full px-2 py-0.5">{count}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 bg-background">
        {count === 0 ? (
          <div className="flex items-center justify-center h-32">
            <EmptyState icon={emptyIcon} title={emptyTitle} className="py-2" />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// ---- Icons ---------------------------------------------------------------

const WINDOW_ICON: Record<string, React.ReactNode> = {
  this_week: <CalendarRange size={28} />,
  next_week: <CalendarRange size={28} />,
  unspecified: <HelpCircle size={28} />,
  later: <Clock size={28} />,
  in_a_month: <Clock size={28} />,
};

const PLANNING_WINDOWS: DashboardSection[] = [
  "this_week",
  "next_week",
  "later",
  "in_a_month",
  "unspecified",
];

// ---- Bucketing -----------------------------------------------------------

interface Buckets {
  planning: Record<string, Discussion[]>;
  coordinated: Discussion[];
  summary: Discussion[];
}

function bucketize(discussions: Discussion[]): Buckets {
  const planning: Record<string, Discussion[]> = {
    this_week: [],
    next_week: [],
    unspecified: [],
    later: [],
    in_a_month: [],
  };
  const coordinated: Discussion[] = [];
  const summary: Discussion[] = [];

  for (const d of discussions) {
    if (d.status === "cancelled") continue;

    if (d.status === "new") {
      const section = effectiveScheduledSection(d.dateWindow, d.scheduledWeek);
      planning[section].push(d);
    } else if (d.status === "coordinated") {
      coordinated.push(d);
    } else if (d.status === "waiting_summary" || d.status === "waiting_approval") {
      summary.push(d);
    }
    // occurred and distributed go to archive — not shown here
  }

  PLANNING_WINDOWS.forEach((w) => planning[w].sort(byCreatedDesc));
  coordinated.sort(byCreatedDesc);
  summary.sort(byCreatedDesc);

  return { planning, coordinated, summary };
}

// ---- Main component ------------------------------------------------------

export function Dashboard({ onOpenDiscussion }: Props) {
  const { discussions, lookupParticipant, loaded, isNewDiscussion } = useStore();
  const buckets = React.useMemo(() => bucketize(discussions), [discussions]);
  const [collapsed, setCollapsed] = React.useState<Partial<Record<DashboardSection, boolean>>>({});
  const [phaseCollapsed, setPhaseCollapsed] = React.useState<Record<string, boolean>>({});
  const toggleSection = (w: DashboardSection) =>
    setCollapsed((prev) => ({ ...prev, [w]: !prev[w] }));
  const togglePhase = (key: string) =>
    setPhaseCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  if (!loaded) {
    return (
      <div className="px-3 py-12">
        <EmptyState title="טוען נתונים..." hint="מתחבר לשרת" />
      </div>
    );
  }

  const planningCount = PLANNING_WINDOWS.reduce((n, w) => n + buckets.planning[w].length, 0);
  const isAllEmpty = planningCount === 0 && buckets.coordinated.length === 0 && buckets.summary.length === 0;

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
    <>
      {/* ── Desktop Kanban (md+) ─────────────────────────────────────── */}
      <div
        className="hidden lg:flex gap-3 px-4 pb-4 pt-3"
        style={{ height: "calc(100dvh - 130px)" }}
      >
        {/* Column 1: בתכנון */}
        <KanbanColumn
          label="בתכנון"
          count={planningCount}
          headerClass="bg-blue-500 text-white"
          borderClass="border-blue-200 dark:border-blue-800"
          emptyTitle={T.empty.this_week}
          emptyIcon={<CalendarRange size={32} />}
        >
          <div className="space-y-3">
            {PLANNING_WINDOWS.map((w) => {
              const items = buckets.planning[w];
              if (items.length === 0) return null;
              const dateHint = sectionDateRange(w);
              return (
                <section key={w}>
                  <div className="flex items-baseline justify-between mb-1.5 px-0.5">
                    <span className="text-xs font-semibold text-foreground/70">{SECTION_LABEL[w]}</span>
                    {dateHint && (
                      <span className="text-[10px] text-muted-foreground/60">{dateHint}</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {items.map((d) => (
                      <DiscussionCard
                        key={d.id}
                        discussion={d}
                        lookupParticipant={lookupParticipant}
                        onOpen={onOpenDiscussion}
                        isNew={isNewDiscussion(d.id)}
                        compact
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </KanbanColumn>

        {/* Column 2: תואם */}
        <KanbanColumn
          label="תואם"
          count={buckets.coordinated.length}
          headerClass="bg-teal-500 text-white"
          borderClass="border-teal-200 dark:border-teal-800"
          emptyTitle="אין דיונים תואמים"
          emptyIcon={<CalendarRange size={32} />}
        >
          <div className="space-y-2">
            {buckets.coordinated.map((d) => (
              <DiscussionCard
                key={d.id}
                discussion={d}
                lookupParticipant={lookupParticipant}
                onOpen={onOpenDiscussion}
                isNew={isNewDiscussion(d.id)}
                hideWindow
                compact
              />
            ))}
          </div>
        </KanbanColumn>

        {/* Column 3: ממתין לסיכום */}
        <KanbanColumn
          label="ממתין לסיכום"
          count={buckets.summary.length}
          headerClass="bg-amber-500 text-white"
          borderClass="border-amber-200 dark:border-amber-800"
          emptyTitle={T.empty.waiting_summary}
          emptyIcon={<Clock size={32} />}
        >
          <div className="space-y-2">
            {buckets.summary.map((d) => (
              <DiscussionCard
                key={d.id}
                discussion={d}
                lookupParticipant={lookupParticipant}
                onOpen={onOpenDiscussion}
                isNew={isNewDiscussion(d.id)}
                compact
              />
            ))}
          </div>
        </KanbanColumn>
      </div>

      {/* ── Mobile list (below md) ──────────────────────────────────── */}
      <div className="lg:hidden space-y-4 px-3 pb-24 pt-3">

        {/* Phase 1: Planning (חדש) */}
        <PhaseBox
          label="בתכנון"
          count={planningCount}
          headerClass="bg-blue-500 text-white"
          borderClass="border-blue-200 dark:border-blue-800"
          collapsed={!!phaseCollapsed["planning"]}
          onToggle={() => togglePhase("planning")}
        >
          {PLANNING_WINDOWS.map((w) => {
            const items = buckets.planning[w];
            const isCollapsed = !!collapsed[w];
            return (
              <section key={w}>
                <SectionHeader
                  title={SECTION_LABEL[w]}
                  hint={items.length > 0 ? (sectionDateRange(w) ?? SECTION_HINT[w]) : undefined}
                  count={items.length}
                  variant={w === "this_week" && items.length > 0 ? "alert" : "default"}
                  collapsed={isCollapsed}
                  onToggle={() => toggleSection(w)}
                />
                {!isCollapsed && (
                  items.length === 0 ? (
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
                  )
                )}
              </section>
            );
          })}
        </PhaseBox>

        {/* Phase 2: Coordinated (תואם) */}
        <PhaseBox
          label="תואם"
          count={buckets.coordinated.length}
          headerClass="bg-teal-500 text-white"
          borderClass="border-teal-200 dark:border-teal-800"
          collapsed={!!phaseCollapsed["coordinated"]}
          onToggle={() => togglePhase("coordinated")}
        >
          <div className="space-y-2 pt-1">
            {buckets.coordinated.map((d) => (
              <DiscussionCard
                key={d.id}
                discussion={d}
                lookupParticipant={lookupParticipant}
                onOpen={onOpenDiscussion}
                isNew={isNewDiscussion(d.id)}
                hideWindow
              />
            ))}
          </div>
        </PhaseBox>

        {/* Phase 3: Summary (ממתין לסיכום) */}
        <PhaseBox
          label="ממתין לסיכום"
          count={buckets.summary.length}
          headerClass="bg-amber-500 text-white"
          borderClass="border-amber-200 dark:border-amber-800"
          collapsed={!!phaseCollapsed["summary"]}
          onToggle={() => togglePhase("summary")}
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

      </div>
    </>
  );
}
