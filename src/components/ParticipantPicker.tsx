import * as React from "react";
import { Search, Plus, Check, X } from "lucide-react";
import { Input } from "./ui/Input";
import { Avatar } from "./ui/Avatar";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { cn } from "@/lib/utils";
import { HOME_UNIT } from "@/lib/he";
import type { Participant, ParticipantGroup } from "@/types";

interface CreateInput {
  name: string;
  role?: string;
  unit?: string;
  external?: boolean;
}

interface Props {
  participants: Participant[];
  groups?: ParticipantGroup[];
  value: string[];
  onChange: (next: string[]) => void;
  /** Create-and-select handler; receives full role + unit when available. */
  onCreate?: (input: CreateInput) => Promise<Participant> | Participant;
  /** Discussion name — participants whose unit appears in it float to the top. */
  nameHint?: string;
  placeholder?: string;
  maxHeight?: number;
  /** Temporary (ad-hoc) participant names for this discussion only. */
  extraValue?: string[];
  onExtraChange?: (names: string[]) => void;
  /** IDs of selected participants who are optional (רשות) for this discussion. */
  optionalIds?: string[];
  onOptionalChange?: (ids: string[]) => void;
}

export function ParticipantPicker({
  participants,
  groups = [],
  value,
  onChange,
  onCreate,
  nameHint = "",
  placeholder = "חפש משתתף...",
  maxHeight = 220,
  extraValue = [],
  onExtraChange,
  optionalIds = [],
  onOptionalChange,
}: Props) {
  const [query, setQuery] = React.useState("");
  const [creatingForName, setCreatingForName] = React.useState<string | null>(null);
  const [draftRole, setDraftRole] = React.useState("");
  const [draftUnit, setDraftUnit] = React.useState(HOME_UNIT);

  const selected = value
    .map((id) => participants.find((p) => p.id === id))
    .filter((p): p is Participant => !!p);

  const filtered = React.useMemo(() => {
    const q = query.trim();
    const list = q
      ? participants.filter(
          (p) =>
            p.name.includes(q) ||
            (p.role && p.role.includes(q)) ||
            (p.unit && p.unit.includes(q))
        )
      : [...participants];

    if (nameHint.trim()) {
      list.sort((a, b) => {
        const aMatch = !!(a.unit && a.unit !== HOME_UNIT && nameHint.includes(a.unit));
        const bMatch = !!(b.unit && b.unit !== HOME_UNIT && nameHint.includes(b.unit));
        if (aMatch !== bMatch) return aMatch ? -1 : 1;
        return 0;
      });
    }

    return list;
  }, [participants, query, nameHint]);

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
      if (optionalIds.includes(id)) {
        onOptionalChange?.(optionalIds.filter((i) => i !== id));
      }
    } else {
      onChange([...value, id]);
      // Auto-mark as optional if the participant is globally optional
      const p = participants.find((x) => x.id === id);
      if (p?.optional && onOptionalChange && !optionalIds.includes(id)) {
        onOptionalChange([...optionalIds, id]);
      }
    }
  };

  const toggleOptional = (id: string) => {
    if (!onOptionalChange) return;
    if (optionalIds.includes(id)) {
      onOptionalChange(optionalIds.filter((i) => i !== id));
    } else {
      onOptionalChange([...optionalIds, id]);
    }
  };

  function startCreate() {
    if (!query.trim()) return;
    setCreatingForName(query.trim());
    setDraftRole("");
    setDraftUnit(HOME_UNIT);
  }

  async function commitCreate() {
    if (!creatingForName || !onCreate) return;
    const unit = draftUnit.trim() || HOME_UNIT;
    const p = await onCreate({
      name: creatingForName,
      role: draftRole.trim() || undefined,
      unit,
      external: unit !== HOME_UNIT,
    });
    onChange([...value, p.id]);
    setCreatingForName(null);
    setQuery("");
    setDraftRole("");
    setDraftUnit(HOME_UNIT);
  }

  function cancelCreate() {
    setCreatingForName(null);
    setDraftRole("");
    setDraftUnit(HOME_UNIT);
  }

  function addAsTemp() {
    const name = query.trim();
    if (!name || !onExtraChange) return;
    onExtraChange([...extraValue, name]);
    setQuery("");
  }

  function addGroup(groupId: string) {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const next = [...new Set([...value, ...group.participantIds])];
    onChange(next);
  }

  const hasSelected = selected.length > 0 || extraValue.length > 0;

  return (
    <div className="space-y-2">
      {/* Group quick-add buttons */}
      {groups.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {groups.map((g) => {
            const allIn = g.participantIds.every((id) => value.includes(id));
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => addGroup(g.id)}
                disabled={allIn}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  allIn
                    ? "border-accent/30 bg-accent/10 text-accent cursor-default"
                    : "border-border bg-card hover:bg-muted text-foreground"
                )}
              >
                {allIn && <Check size={11} />}
                {g.name}
                <span className="text-muted-foreground">({g.participantIds.length})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected chips */}
      {hasSelected && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((p) => {
            const isOpt = optionalIds.includes(p.id);
            return (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full border bg-primary text-primary-foreground border-primary px-2.5 py-1 text-xs font-medium"
              >
                <span>{p.name}</span>
                {onOptionalChange && (
                  <button
                    type="button"
                    title={isOpt ? "בטל רשות" : "סמן כרשות לדיון זה"}
                    onClick={() => toggleOptional(p.id)}
                    className={cn(
                      "rounded px-1 text-[9px] leading-tight transition-colors select-none",
                      isOpt ? "bg-white/30 text-white" : "opacity-30 hover:opacity-70 text-white/80"
                    )}
                  >
                    רשות
                  </button>
                )}
                <button
                  type="button"
                  aria-label="הסר"
                  onClick={() => toggle(p.id)}
                  className="rounded-full hover:bg-white/20 p-0.5"
                >
                  <X size={10} />
                </button>
              </span>
            );
          })}
          {extraValue.map((name, i) => (
            <span
              key={`extra-${i}`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted text-foreground/70 px-2.5 py-1 text-xs font-medium"
            >
              <span>{name}</span>
              <span className="text-[9px] opacity-50 mx-0.5">זמני</span>
              <button
                type="button"
                aria-label="הסר"
                onClick={() => onExtraChange?.(extraValue.filter((_, j) => j !== i))}
                className="rounded-full hover:bg-foreground/10 p-0.5"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search
          size={14}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (creatingForName && creatingForName !== e.target.value.trim()) {
              setCreatingForName(null);
            }
          }}
          placeholder={placeholder}
          className="pr-9"
        />
      </div>

      {/* Inline create form */}
      {creatingForName && (
        <div className="rounded-lg border border-accent/40 bg-accent/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">
              משתתף חדש (קבוע): <span className="font-semibold">{creatingForName}</span>
            </span>
            <button
              type="button"
              onClick={cancelCreate}
              className="text-muted-foreground hover:text-foreground p-1"
              aria-label="ביטול"
            >
              <X size={14} />
            </button>
          </div>
          <Input
            value={draftRole}
            onChange={(e) => setDraftRole(e.target.value)}
            placeholder={'תפקיד / דרגה — לדוגמה: סא"ל · ראש מבצעים'}
          />
          <Input
            value={draftUnit}
            onChange={(e) => setDraftUnit(e.target.value)}
            placeholder={`יחידה — לדוגמה: "${HOME_UNIT}", אוגדה 162`}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              {draftUnit.trim() && draftUnit.trim() !== HOME_UNIT ? (
                <Badge tone="warning">יסומן כחיצוני</Badge>
              ) : (
                <span>פנימי ל-{HOME_UNIT}</span>
              )}
            </p>
            <Button size="sm" onClick={commitCreate}>
              <Check size={14} />
              הוסף קבוע
            </Button>
          </div>
        </div>
      )}

      {/* Suggestions list */}
      {!creatingForName && (
        <div
          className="overflow-y-auto scrollbar-thin rounded-lg border border-border bg-card"
          style={{ maxHeight }}
        >
          {filtered.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">
              <p>לא נמצאו משתתפים מתאימים.</p>
              {query.trim() && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {onCreate && (
                    <Button size="sm" variant="outline" onClick={startCreate}>
                      <Plus size={14} />
                      הוסף "{query}" קבוע
                    </Button>
                  )}
                  {onExtraChange && (
                    <Button size="sm" variant="ghost" onClick={addAsTemp}>
                      <Plus size={14} />
                      הוסף "{query}" זמנית
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {filtered.map((p) => {
                  const isOn = value.includes(p.id);
                  const isExternal = !!p.unit && p.unit !== HOME_UNIT;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => toggle(p.id)}
                        className={cn(
                          "w-full flex items-center gap-3 p-2.5 text-right hover:bg-muted/70 transition-colors",
                          isOn && "bg-accent/5"
                        )}
                      >
                        <Avatar name={p.name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate flex items-center gap-1.5 flex-wrap">
                            <span className="truncate">{p.name}</span>
                            {isExternal && (
                              <Badge tone="warning">חיצוני</Badge>
                            )}
                            {p.optional && (
                              <Badge tone="muted">רשות (ברירת מחדל)</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {[p.role, p.unit].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        {isOn && <Check size={16} className="text-accent" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {/* Add temp at bottom of results */}
              {query.trim() && onExtraChange && (
                <div className="border-t border-border">
                  <button
                    type="button"
                    onClick={addAsTemp}
                    className="w-full flex items-center gap-2 p-2.5 text-right text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Plus size={12} className="shrink-0" />
                    הוסף &quot;{query}&quot; זמנית (לא יישמר)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
