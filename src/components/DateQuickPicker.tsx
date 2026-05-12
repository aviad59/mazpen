import * as React from "react";
import { Calendar as CalIcon, X } from "lucide-react";
import { Chip } from "./ui/Chip";
import { Input } from "./ui/Input";
import { cn, formatHebrewDate } from "@/lib/utils";

interface Props {
  /** ISO datetime string, or null for "no date". */
  value: string | null;
  onChange: (iso: string | null) => void;
}

/** 0=Sunday … 6=Saturday (matches Date.getDay()). */
const WEEK_DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** Israeli work-week (Sun..Thu). */
const WORK_DAYS = [0, 1, 2, 3, 4];

/** Anchor every stored date at local noon — avoids TZ off-by-one. */
const ANCHOR_HOUR = 12;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Date for next occurrence of `dow` (0=Sun..6=Sat). If today matches, returns today. */
function dateForDow(dow: number, base: Date): Date {
  const today = startOfDay(base);
  const currentDow = today.getDay();
  let diff = dow - currentDow;
  if (diff < 0) diff += 7;
  const out = new Date(today);
  out.setDate(today.getDate() + diff);
  out.setHours(ANCHOR_HOUR, 0, 0, 0);
  return out;
}

function nextWeekDate(dow: number, base: Date): Date {
  const d = dateForDow(dow, base);
  const todayDow = startOfDay(base).getDay();
  // If `dateForDow` landed in this week, push 7 more days
  if (dow >= todayDow) d.setDate(d.getDate() + 7);
  return d;
}

function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function sameDay(a: Date | null, b: Date): boolean {
  if (!a) return false;
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function DateQuickPicker({ value, onChange }: Props) {
  const now = new Date();
  const todayDow = startOfDay(now).getDay();

  const parsed = React.useMemo(() => (value ? new Date(value) : null), [value]);
  const [dateStr, setDateStr] = React.useState(parsed ? toDateInput(parsed) : "");

  React.useEffect(() => {
    setDateStr(parsed ? toDateInput(parsed) : "");
  }, [value, parsed]);

  function emitDateString(dateInput: string) {
    if (!dateInput) {
      onChange(null);
      return;
    }
    const local = new Date(`${dateInput}T${String(ANCHOR_HOUR).padStart(2, "0")}:00:00`);
    if (Number.isNaN(local.getTime())) return;
    onChange(local.toISOString());
  }

  function applyDate(d: Date) {
    setDateStr(toDateInput(d));
    onChange(d.toISOString());
  }

  // "This week" chips: today, tomorrow + remaining work-days of this week
  const tomorrowDow = (todayDow + 1) % 7;
  const thisWeekChips: { label: string; date: Date; key: string }[] = [
    { label: "היום", date: dateForDow(todayDow, now), key: "today" },
    { label: "מחר", date: dateForDow(tomorrowDow, now), key: "tomorrow" },
  ];

  for (const dow of WORK_DAYS) {
    if (dow === todayDow || dow === tomorrowDow) continue;
    const d = dateForDow(dow, now);
    const days = (d.getTime() - startOfDay(now).getTime()) / 86_400_000;
    if (days < 7) {
      thisWeekChips.push({
        label: `יום ${WEEK_DAYS_HE[dow]}`,
        date: d,
        key: `t-${dow}`,
      });
    }
  }

  const nextWeekChips = WORK_DAYS.map((dow) => ({
    label: `${WEEK_DAYS_HE[dow]} הבא`,
    date: nextWeekDate(dow, now),
    key: `n-${dow}`,
  }));

  const cleared = !value;

  return (
    <div className="space-y-3">
      {/* Current value preview */}
      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
          cleared
            ? "border-dashed border-destructive/40 bg-destructive/5 text-destructive"
            : "border-border bg-muted/40 text-foreground"
        )}
      >
        <span className="flex items-center gap-2 min-w-0 truncate">
          <CalIcon size={14} className="shrink-0" />
          <span className="font-medium truncate">
            {cleared ? "לא נקבע מועד" : formatHebrewDate(value)}
          </span>
        </span>
        {!cleared && (
          <button
            type="button"
            onClick={() => {
              setDateStr("");
              onChange(null);
            }}
            className="rounded-md p-1 hover:bg-foreground/10 text-muted-foreground"
            aria-label="נקה תאריך"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* This-week chips */}
      <div>
        <p className="text-[11px] text-muted-foreground mb-1.5">השבוע</p>
        <div className="flex flex-wrap gap-1.5">
          {thisWeekChips.map((c) => (
            <Chip
              key={c.key}
              size="sm"
              active={sameDay(parsed, c.date)}
              onClick={() => applyDate(c.date)}
            >
              {c.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Next-week chips */}
      <div>
        <p className="text-[11px] text-muted-foreground mb-1.5">שבוע הבא</p>
        <div className="flex flex-wrap gap-1.5">
          {nextWeekChips.map((c) => (
            <Chip
              key={c.key}
              size="sm"
              active={sameDay(parsed, c.date)}
              onClick={() => applyDate(c.date)}
            >
              {c.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Manual date input (no time) */}
      <div>
        <label className="text-[11px] text-muted-foreground mb-1 block">
          <CalIcon size={10} className="inline -mt-0.5 ml-1" />
          תאריך מותאם
        </label>
        <Input
          type="date"
          value={dateStr}
          onChange={(e) => {
            setDateStr(e.target.value);
            emitDateString(e.target.value);
          }}
        />
      </div>
    </div>
  );
}
