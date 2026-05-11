import * as React from "react";
import { Search, Plus, Check } from "lucide-react";
import { Input } from "./ui/Input";
import { Avatar } from "./ui/Avatar";
import { Chip } from "./ui/Chip";
import { Button } from "./ui/Button";
import { cn } from "@/lib/utils";
import type { Participant } from "@/types";

interface Props {
  participants: Participant[];
  value: string[];
  onChange: (next: string[]) => void;
  onCreate?: (input: { name: string; role?: string }) => Promise<Participant> | Participant;
  placeholder?: string;
  maxHeight?: number;
}

export function ParticipantPicker({
  participants,
  value,
  onChange,
  onCreate,
  placeholder = "חפש משתתף...",
  maxHeight = 220,
}: Props) {
  const [query, setQuery] = React.useState("");

  const selected = value
    .map((id) => participants.find((p) => p.id === id))
    .filter((p): p is Participant => !!p);

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

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  const handleCreate = async () => {
    const name = query.trim();
    if (!name || !onCreate) return;
    const p = await onCreate({ name });
    onChange([...value, p.id]);
    setQuery("");
  };

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
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="pr-9"
        />
      </div>

      {/* Suggestions list */}
      <div
        className="overflow-y-auto scrollbar-thin rounded-lg border border-border bg-card"
        style={{ maxHeight }}
      >
        {filtered.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">
            <p>לא נמצאו משתתפים מתאימים.</p>
            {onCreate && query.trim() && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleCreate}
                className="mt-2"
              >
                <Plus size={14} />
                הוסף "{query}" כמשתתף חדש
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((p) => {
              const isOn = value.includes(p.id);
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
                      <div className="text-sm font-medium truncate">{p.name}</div>
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
    </div>
  );
}
