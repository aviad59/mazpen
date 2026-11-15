import * as React from "react";
import { Search, Star, X } from "lucide-react";
import { cn, formatHebrewDate, getWeekStart } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/he";
import type { Discussion, DiscussionStatus } from "@/types";
import { Input } from "./ui/Input";
import { Button } from "./ui/Button";

interface Props {
  discussions: Discussion[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  /** Participant id → display name. */
  nameOf: (id: string) => string | undefined;
  /** Whether a discussion has an unsaved live-summary draft. */
  hasDraft: (id: string) => boolean;
}

/** Hebrew-friendly normalization: case, quotes/gershayim, punctuation, final letters. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "") // niqqud / cantillation
    .replace(/["'״׳`]/g, "")
    .replace(/[ך]/g, "כ")
    .replace(/[ם]/g, "מ")
    .replace(/[ן]/g, "נ")
    .replace(/[ף]/g, "פ")
    .replace(/[ץ]/g, "צ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Statuses closest to "being recorded now" rank first. */
const STATUS_WEIGHT: Partial<Record<DiscussionStatus, number>> = {
  occurred: 4,
  coordinated: 3,
  waiting_summary: 3,
  new: 1,
  waiting_approval: 0,
};

function weekLabel(week: string | undefined): string | null {
  if (!week) return null;
  if (week === getWeekStart(0)) return "השבוע";
  if (week === getWeekStart(1)) return "שבוע הבא";
  if (week === getWeekStart(-1)) return "שבוע שעבר";
  return formatHebrewDate(week);
}

interface Row {
  d: Discussion;
  people: string[];
  haystack: string;
  nameNorm: string;
  base: number;
  week: string | null;
  draft: boolean;
}

export function DiscussionPicker({ discussions, value, onChange, disabled, nameOf, hasDraft }: Props) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(!value);
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);

  const rows = React.useMemo<Row[]>(() => {
    const thisWeek = getWeekStart(0);
    const near = new Set([getWeekStart(-1), getWeekStart(1)]);
    return discussions.map((d) => {
      const people = [
        ...(d.leaderId ? [nameOf(d.leaderId)] : []),
        ...d.participantIds.map(nameOf),
        ...(d.extraParticipants ?? []),
      ].filter((n): n is string => !!n);
      const uniquePeople = [...new Set(people)];
      const draft = hasDraft(d.id);
      const base =
        (draft ? 6 : 0) +
        (STATUS_WEIGHT[d.status] ?? 0) +
        (d.scheduledWeek === thisWeek ? 3 : d.scheduledWeek && near.has(d.scheduledWeek) ? 1 : 0) +
        (d.important ? 1 : 0);
      return {
        d,
        people: uniquePeople,
        haystack: norm([d.name, ...uniquePeople, STATUS_LABEL[d.status]].join(" ")),
        nameNorm: norm(d.name),
        base,
        week: weekLabel(d.scheduledWeek),
        draft,
      };
    });
  }, [discussions, nameOf, hasDraft]);

  const results = React.useMemo(() => {
    const q = norm(query);
    const tokens = q ? q.split(" ") : [];
    const scored: { row: Row; score: number }[] = [];
    for (const row of rows) {
      if (tokens.length && !tokens.every((t) => row.haystack.includes(t))) continue;
      let score = row.base;
      if (q) {
        if (row.nameNorm.startsWith(q)) score += 10;
        else if (row.nameNorm.includes(q)) score += 7;
        score += tokens.filter((t) => row.nameNorm.includes(t)).length * 2;
      }
      scored.push({ row, score });
    }
    scored.sort((a, b) => b.score - a.score || b.row.d.updatedAt.localeCompare(a.row.d.updatedAt));
    return scored.slice(0, 50).map((s) => s.row);
  }, [rows, query]);

  React.useEffect(() => setActive(0), [query, open]);
  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  const selected = rows.find((r) => r.d.id === value);

  if (selected && !open) {
    return (
      <div className="flex items-start justify-between gap-2 rounded-lg border border-input bg-card p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{selected.d.name}</p>
          <RowMeta row={selected} />
        </div>
        <Button
          variant="outline"
          className="shrink-0"
          disabled={disabled}
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
        >
          החלף דיון
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              pick(results[active].d.id);
            } else if (e.key === "Escape" && selected) {
              setOpen(false);
              setQuery("");
            }
          }}
          placeholder="חפש דיון לפי שם, משתתף, מוביל או סטטוס..."
          aria-label="חיפוש דיון"
          className="pr-9 pl-9"
        />
        {(query || selected) && (
          <button
            type="button"
            aria-label={query ? "נקה חיפוש" : "סגור"}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => {
              if (query) setQuery("");
              else setOpen(false);
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {query
          ? `${results.length} תוצאות`
          : "מוצגים קודם: דיונים עם הקלטה שלא נשמרה, דיונים של השבוע ודיונים שהתקיימו או מחכים לסיכום"}
      </p>

      <ul ref={listRef} role="listbox" className="max-h-72 overflow-y-auto rounded-lg border border-input divide-y divide-border">
        {results.length === 0 && (
          <li className="p-3 text-sm text-muted-foreground">
            {discussions.length ? "לא נמצא דיון מתאים" : "אין דיונים פתוחים"}
          </li>
        )}
        {results.map((row, i) => (
          <li
            key={row.d.id}
            data-idx={i}
            role="option"
            aria-selected={row.d.id === value}
            onMouseEnter={() => setActive(i)}
            onClick={() => pick(row.d.id)}
            className={cn(
              "cursor-pointer p-3 transition-colors",
              i === active ? "bg-muted" : "hover:bg-muted/60",
              row.d.id === value && "border-r-2 border-accent"
            )}
          >
            <p className="text-sm font-medium flex items-center gap-1.5">
              {row.d.important && <Star size={12} className="text-amber-500 fill-amber-500 shrink-0" />}
              <span className="truncate">{row.d.name}</span>
            </p>
            <RowMeta row={row} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RowMeta({ row }: { row: Row }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="rounded bg-muted px-1.5 py-0.5">{STATUS_LABEL[row.d.status]}</span>
      {row.week && <span className="rounded bg-muted px-1.5 py-0.5">{row.week}</span>}
      {row.draft && <span className="rounded bg-amber-500/15 text-amber-700 px-1.5 py-0.5">טיוטה</span>}
      {row.people.length > 0 && (
        <span className="truncate">
          {row.people.slice(0, 4).join(", ")}
          {row.people.length > 4 ? ` +${row.people.length - 4}` : ""}
        </span>
      )}
    </div>
  );
}
