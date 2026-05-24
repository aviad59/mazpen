import * as React from "react";
import { Calendar, CalendarRange, CalendarDays, Clock, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { WINDOW_LABEL } from "@/lib/he";
import type { DateWindow } from "@/types";

interface Props {
  value: DateWindow;
  onChange: (next: DateWindow) => void;
}

function fmt(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

function weekStart(offsetWeeks: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + offsetWeeks * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekEnd(sun: Date): Date {
  const d = new Date(sun);
  d.setDate(sun.getDate() + 6);
  return d;
}

function buildDateHints(): Record<DateWindow, string> {
  const thisSun = weekStart(0);
  const nextSun = weekStart(1);
  const laterSun = weekStart(2);
  const laterEnd = weekEnd(weekStart(3));
  const monthSun = weekStart(4);

  return {
    this_week:   `${fmt(thisSun)}–${fmt(weekEnd(thisSun))}`,
    next_week:   `${fmt(nextSun)}–${fmt(weekEnd(nextSun))}`,
    later:       `${fmt(laterSun)}–${fmt(laterEnd)}`,
    in_a_month:  `מ-${fmt(monthSun)} ואילך`,
    unspecified: "טרם הוחלט",
  };
}

const WINDOWS: { key: DateWindow; icon: React.ReactNode }[] = [
  { key: "this_week",   icon: <Calendar size={16} /> },
  { key: "next_week",   icon: <CalendarRange size={16} /> },
  { key: "later",       icon: <Clock size={16} /> },
  { key: "in_a_month",  icon: <CalendarDays size={16} /> },
  { key: "unspecified", icon: <HelpCircle size={16} /> },
];

export function DateWindowPicker({ value, onChange }: Props) {
  const hints = React.useMemo(() => buildDateHints(), []);

  return (
    <div className="grid grid-cols-2 gap-2">
      {WINDOWS.map((w) => {
        const active = value === w.key;
        return (
          <button
            key={w.key}
            type="button"
            onClick={() => onChange(w.key)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-right transition-colors no-tap-highlight",
              active
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-card hover:bg-muted",
              w.key === "unspecified" && "col-span-2"
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              {w.icon}
              {WINDOW_LABEL[w.key]}
            </span>
            <span className="text-[11px] text-muted-foreground">{hints[w.key]}</span>
          </button>
        );
      })}
    </div>
  );
}
