import * as React from "react";
import { Calendar, CalendarRange, Clock, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { WINDOW_LABEL } from "@/lib/he";
import type { DateWindow } from "@/types";

interface Props {
  value: DateWindow;
  onChange: (next: DateWindow) => void;
}

const WINDOWS: { key: DateWindow; icon: React.ReactNode; hint: string }[] = [
  {
    key: "this_week",
    icon: <Calendar size={16} />,
    hint: "ימים הקרובים",
  },
  {
    key: "next_week",
    icon: <CalendarRange size={16} />,
    hint: "השבוע שאחרי",
  },
  {
    key: "later",
    icon: <Clock size={16} />,
    hint: "מעבר לשבועיים",
  },
  {
    key: "unspecified",
    icon: <HelpCircle size={16} />,
    hint: "טרם הוחלט",
  },
];

/**
 * 4 coarse window choices — the secretary picks a bucket, not a day.
 * Renders as a 2×2 grid of large tap-friendly tiles.
 */
export function DateWindowPicker({ value, onChange }: Props) {
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
                : "border-border bg-card hover:bg-muted"
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              {w.icon}
              {WINDOW_LABEL[w.key]}
            </span>
            <span className="text-[11px] text-muted-foreground">{w.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
