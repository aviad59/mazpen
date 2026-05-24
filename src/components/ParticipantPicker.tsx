import * as React from "react";
import { Search, Plus, Check, X, Users } from "lucide-react";
import { Input } from "./ui/Input";
import { Avatar } from "./ui/Avatar";
import { Chip } from "./ui/Chip";
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
  placeholder?: string;
  maxHeight?: number;
}

/**
 * Participant chooser. Supports inline creation: when the search query
 * doesn't match anything, a small in-line form lets the secretary add
 * a new participant with role + unit without leaving the discussion form.
 */
export function ParticipantPicker({
  participants,
  groups = [],
  value,
  onChange,
  onCreate,
  placeholder = "חפש משתתף...",
  maxHeight = 220,
}: Props) {
  const [query, setQuery] = React.useState("");
  const [creatingForName, setCreatingForName] = React.useState<string | null>(null);
  const [draftRole, setDraftRole] = React.useState("");
  const [draftUnit, setDraftUnit] = React.useState(HOME_UNIT);

  const selected = value
    .map((id) => participants.find((p) => p.id === id))
    .filter((p): p is Participant => !!p);

  const filteredGroups = React.useMemo(() => {
    const q = query.trim();
    if (!q) return groups;
    return groups.filter((g) => g.name.includes(q));
  }, [groups, query]);

  const filtered = React.useMemo(() => {
    const q = query.trim();
    if (!q) return participants;
    return participants.filter(
      (p) =>
        p.name.includes(q) ||
        (p.role && p.role.includes(q)) ||
        (p.unit && p.unit.includes(q))
    );
  }, [participants, query]);

  function addGroup(g: ParticipantGroup) {
    const toAdd = g.participantIds.filter((id) => !value.includes(id));
    if (toAdd.length > 0) onChange([...value, ...toAdd]);
  }

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
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

  return (
    <div className="space-y-2">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <Chip
              key={p.id}
              size="sm"
              onRemove={() => toggle(p.id)}
              active
            >
              {p.name}
            </Chip>
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
            // Cancel inline-create if user keeps typing a different name
            if (creatingForName && creatingForName !== e.target.value.trim()) {
              setCreatingForName(null);
            }
          }}
          placeholder={placeholder}
          className="pr-9"
        />
      </div>

      {/* Inline create form — appears once the user clicks "add" on a missing name */}
      {creatingForName && (
        <div className="rounded-lg border border-accent/40 bg-accent/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">
              משתתף חדש: <span className="font-semibold">{creatingForName}</span>
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
              הוסף
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
          {filteredGroups.length === 0 && filtered.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">
              <p>לא נמצאו משתתפים מתאימים.</p>
              {onCreate && query.trim() && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={startCreate}
                  className="mt-2"
                >
                  <Plus size={14} />
                  הוסף "{query}" כמשתתף חדש
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filteredGroups.map((g) => {
                const memberCount = g.participantIds.length;
                const alreadyAll = g.participantIds.every((id) => value.includes(id));
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => addGroup(g)}
                      disabled={alreadyAll}
                      className={cn(
                        "w-full flex items-center gap-3 p-2.5 text-right hover:bg-muted/70 transition-colors",
                        alreadyAll && "opacity-50 cursor-default"
                      )}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                        <Users size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{g.name}</div>
                        <div className="text-xs text-muted-foreground">{memberCount} משתתפים</div>
                      </div>
                      <Badge tone="info">קבוצה</Badge>
                    </button>
                  </li>
                );
              })}
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
                        <div className="text-sm font-medium truncate flex items-center gap-1.5">
                          <span className="truncate">{p.name}</span>
                          {isExternal && (
                            <Badge tone="warning">חיצוני</Badge>
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
          )}
        </div>
      )}
    </div>
  );
}
