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
  bodyProps?: React.HTMLAttributes<HTMLDivElement>;
  isDragOver?: boolean;
}

function KanbanColumn({ label, count, headerClass, borderClass, emptyTitle, emptyIcon, children, bodyProps, isDragOver }: KanbanColumnProps) {
  return (
    <div className={cn("flex-1 flex flex-col min-h-0 min-w-0 rounded-xl border-2 overflow-hidden transition-colors", borderClass, isDragOver && "border-accent/60")}>
      <div className={cn("flex items-center justify-between px-4 py-2.5 shrink-0", headerClass)}>
        <span className="text-sm font-bold tracking-wide">{label}</span>
        <span className="text-xs font-semibold bg-white/20 rounded-full px-2 py-0.5">{count}</span>
      </div>
      <div className={cn("flex-1 overflow-y-auto p-3 bg-background transition-colors", isDragOver && "bg-accent/5")} {...bodyProps}>
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
  const { discussions, lookupParticipant, loaded, isNewDiscussion, changeStatus, setDateWindow } = useStore();
  const buckets = React.useMemo(() => bucketize(discussions), [discussions]);
  const [collapsed, setCollapsed] = React.useState<Partial<Record<DashboardSection, boolean>>>({});
  const [phaseCollapsed, setPhaseCollapsed] = React.useState<Record<string, boolean>>({});
  const toggleSection = (w: DashboardSection) =>
    setCollapsed((prev) => ({ ...prev, [w]: !prev[w] }));
  const togglePhase = (key: string) =>
    setPhaseCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  // ── Drag-and-drop state (desktop only) ────────────────────────────────────
  const [draggedId, setDraggedId] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState<string | null>(null);

  function onCardDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggedId(id);
  }

  function onCardDragEnd() {
    setDraggedId(null);
    setDragOver(null);
  }

  function dropSectionProps(window: string) {
    return {
      onDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver(`s:${window}`); },
      onDragLeave(e: React.DragEvent) { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null); },
      onDrop(e: React.DragEvent) {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        if (!id) return;
        const d = discussions.find((x) => x.id === id);
        if (!d) return;
        if (d.status !== "new") changeStatus(id, "new");
        if (d.dateWindow !== window) setDateWindow(id, window as import("@/types").DateWindow);
        setDragOver(null); setDraggedId(null);
      },
    };
  }

  function dropColumnProps(targetKey: string, onDrop: (id: string) => void) {
    return {
      onDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver(targetKey); },
      onDragLeave(e: React.DragEvent) { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null); },
      onDrop(e: React.DragEvent) {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        if (id) onDrop(id);
        setDragOver(null); setDraggedId(null);
      },
    };
  }

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
      <div className="hidden lg:flex gap-3 px-4 pb-4 pt-3 h-full min-h-0">
        {/* Column 1: בתכנון — section-level drop zones */}
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
              const isOver = dragOver === `s:${w}`;
              const dateHint = sectionDateRange(w);
              return (
                <section
                  key={w}
                  {...dropSectionProps(w)}
                  className={cn("rounded-lg p-1 -m-1 transition-colors", isOver && "bg-accent/10 ring-1 ring-accent/40")}
                >
                  <div className="flex items-baseline justify-between mb-1.5 px-0.5">
                    <span className="text-xs font-semibold text-foreground/70">{SECTION_LABEL[w]}</span>
                    {dateHint && (
                      <span className="text-[10px] text-muted-foreground/60">{dateHint}</span>
                    )}
                  </div>
                  {items.length === 0 ? (
                    <div className={cn("h-10 rounded border-2 border-dashed border-transparent transition-colors", isOver && "border-accent/30")} />
                  ) : (
                    <div className="space-y-2">
                      {items.map((d) => (
                        <div
                          key={d.id}
                          draggable
                          onDragStart={(e) => onCardDragStart(e, d.id)}
                          onDragEnd={onCardDragEnd}
                          className={cn("cursor-grab active:cursor-grabbing transition-opacity", draggedId === d.id && "opacity-40")}
                        >
                          <DiscussionCard
                            discussion={d}
                            lookupParticipant={lookupParticipant}
                            onOpen={onOpenDiscussion}
                            isNew={isNewDiscussion(d.id)}
                            compact
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </KanbanColumn>

        {/* Column 2: תואם — column-body drop zone */}
        <KanbanColumn
          label="תואם"
          count={buckets.coordinated.length}
          headerClass="bg-teal-500 text-white"
          borderClass="border-teal-200 dark:border-teal-800"
          emptyTitle="אין דיונים תואמים"
          emptyIcon={<CalendarRange size={32} />}
          isDragOver={dragOver === "col-2"}
          bodyProps={dropColumnProps("col-2", (id) => {
            const d = discussions.find((x) => x.id === id);
            if (d && d.status !== "coordinated") changeStatus(id, "coordinated");
          })}
        >
          <div className="space-y-2">
            {buckets.coordinated.map((d) => (
              <div
                key={d.id}
                draggable
                onDragStart={(e) => onCardDragStart(e, d.id)}
                onDragEnd={onCardDragEnd}
                className={cn("cursor-grab active:cursor-grabbing transition-opacity", draggedId === d.id && "opacity-40")}
              >
                <DiscussionCard
                  discussion={d}
                  lookupParticipant={lookupParticipant}
                  onOpen={onOpenDiscussion}
                  isNew={isNewDiscussion(d.id)}
                  hideWindow
                  compact
                />
              </div>
            ))}
          </div>
        </KanbanColumn>

        {/* Column 3: ממתין לסיכום — column-body drop zone */}
        <KanbanColumn
          label="ממתין לסיכום"
          count={buckets.summary.length}
          headerClass="bg-amber-500 text-white"
          borderClass="border-amber-200 dark:border-amber-800"
          emptyTitle={T.empty.waiting_summary}
          emptyIcon={<Clock size={32} />}
          isDragOver={dragOver === "col-3"}
          bodyProps={dropColumnProps("col-3", (id) => {
            const d = discussions.find((x) => x.id === id);
            if (d && d.status === "coordinated" && d.requiresSummary) changeStatus(id, "waiting_summary");
          })}
        >
          <div className="space-y-2">
            {buckets.summary.map((d) => (
              <div
                key={d.id}
                draggable
                onDragStart={(e) => onCardDragStart(e, d.id)}
                onDragEnd={onCardDragEnd}
                className={cn("cursor-grab active:cursor-grabbing transition-opacity", draggedId === d.id && "opacity-40")}
              >
                <DiscussionCard
                  discussion={d}
                  lookupParticipant={lookupParticipant}
                  onOpen={onOpenDiscussion}
                  isNew={isNewDiscussion(d.id)}
                  compact
                />
              </div>
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
