import * as React from "react";
import { Plus, Pencil, Trash2, X, Check, Users as UsersIcon } from "lucide-react";
import { Sheet } from "./ui/Sheet";
import { Input, Label } from "./ui/Input";
import { Button } from "./ui/Button";
import { Avatar } from "./ui/Avatar";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
import { EmptyState } from "./ui/EmptyState";
import { useStore } from "@/store/useStore";
import { HOME_UNIT } from "@/lib/he";
import type { Participant } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface DraftFields {
  name: string;
  role: string;
  unit: string;
  optional: boolean;
}

const EMPTY: DraftFields = { name: "", role: "", unit: HOME_UNIT, optional: false };

export function ParticipantsSheet({ open, onClose }: Props) {
  const { participants, addParticipant, updateParticipant, removeParticipant } =
    useStore();

  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState<DraftFields>(EMPTY);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<DraftFields>(EMPTY);
  const [filter, setFilter] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setCreating(false);
      setDraft(EMPTY);
      setEditingId(null);
      setFilter("");
    }
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = filter.trim();
    const list = q
      ? participants.filter(
          (p) =>
            p.name.includes(q) ||
            (p.role && p.role.includes(q)) ||
            (p.unit && p.unit.includes(q))
        )
      : participants;
    // Internal first, then external; stable by name
    return [...list].sort((a, b) => {
      const aExt = !!a.unit && a.unit !== HOME_UNIT ? 1 : 0;
      const bExt = !!b.unit && b.unit !== HOME_UNIT ? 1 : 0;
      if (aExt !== bExt) return aExt - bExt;
      return a.name.localeCompare(b.name, "he");
    });
  }, [participants, filter]);

  async function handleCreate() {
    const name = draft.name.trim();
    if (!name) return;
    await addParticipant({
      name,
      role: draft.role.trim() || undefined,
      unit: draft.unit.trim() || HOME_UNIT,
      external: !!draft.unit.trim() && draft.unit.trim() !== HOME_UNIT,
      optional: draft.optional,
    });
    setDraft(EMPTY);
    setCreating(false);
  }

  function startEdit(p: Participant) {
    setEditingId(p.id);
    setEditDraft({ name: p.name, role: p.role ?? "", unit: p.unit ?? HOME_UNIT, optional: p.optional ?? false });
  }

  async function commitEdit() {
    if (!editingId) return;
    const original = participants.find((p) => p.id === editingId);
    if (!original) return;
    const unit = editDraft.unit.trim() || HOME_UNIT;
    await updateParticipant({
      ...original,
      name: editDraft.name.trim() || original.name,
      role: editDraft.role.trim() || undefined,
      unit,
      external: unit !== HOME_UNIT,
      optional: editDraft.optional,
    });
    setEditingId(null);
  }

  async function handleDelete(p: Participant) {
    if (!confirm(`למחוק את ${p.name}?`)) return;
    await removeParticipant(p.id);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="full"
      title={
        <span className="flex items-center gap-2">
          <UsersIcon size={18} />
          ניהול משתתפים
        </span>
      }
      footer={
        creating ? (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                setCreating(false);
                setDraft(EMPTY);
              }}
              className="flex-1"
            >
              ביטול
            </Button>
            <Button
              size="md"
              onClick={handleCreate}
              disabled={!draft.name.trim()}
              className="flex-[2]"
            >
              שמור משתתף
            </Button>
          </div>
        ) : (
          <Button onClick={() => setCreating(true)} className="w-full" size="md">
            <Plus size={16} />
            הוסף משתתף חדש
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {creating && (
          <Card className="p-4 border-accent/40 bg-accent/5 space-y-3">
            <div className="text-sm font-semibold">משתתף חדש</div>
            <div>
              <Label>שם מלא *</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
                placeholder="לדוגמה: דנה ברקת"
              />
            </div>
            <div>
              <Label>תפקיד / דרגה</Label>
              <Input
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                placeholder={'לדוגמה: סא"ל · ראש מבצעים'}
              />
            </div>
            <div>
              <Label>יחידה</Label>
              <Input
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                placeholder="לדוגמה: מצפן / אוגדה 162 / חיל האוויר"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                יחידה ששונה מ-"{HOME_UNIT}" תסומן כחיצונית.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draft.optional}
                onChange={(e) => setDraft({ ...draft, optional: e.target.checked })}
                className="accent-accent w-4 h-4"
              />
              <span className="text-sm">השתתפות רשות</span>
            </label>
          </Card>
        )}

        {!creating && (
          <Input
            placeholder="חפש משתתף, תפקיד או יחידה..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon={<UsersIcon size={32} />}
            title={filter ? "לא נמצאו משתתפים" : "אין משתתפים עדיין"}
            hint={filter ? "נסה חיפוש אחר" : "הוסף משתתף ראשון בלחיצה על הכפתור למטה"}
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((p) => {
              const isExternal = !!p.unit && p.unit !== HOME_UNIT;
              const isOptional = !!p.optional;
              const isEditing = editingId === p.id;
              return (
                <li key={p.id}>
                  <Card className="p-3">
                    {isEditing ? (
                      <div className="space-y-2">
                        <Input
                          value={editDraft.name}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, name: e.target.value })
                          }
                          placeholder="שם"
                        />
                        <Input
                          value={editDraft.role}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, role: e.target.value })
                          }
                          placeholder="תפקיד / דרגה"
                        />
                        <Input
                          value={editDraft.unit}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, unit: e.target.value })
                          }
                          placeholder="יחידה"
                        />
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={editDraft.optional}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, optional: e.target.checked })
                            }
                            className="accent-accent w-4 h-4"
                          />
                          <span className="text-sm">השתתפות רשות</span>
                        </label>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                            className="flex-1"
                          >
                            <X size={14} /> ביטול
                          </Button>
                          <Button size="sm" onClick={commitEdit} className="flex-[2]">
                            <Check size={14} /> שמור
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <Avatar name={p.name} size="md" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-semibold truncate">
                              {p.name}
                            </span>
                            {isExternal && <Badge tone="warning">חיצוני</Badge>}
                            {isOptional && <Badge tone="muted">רשות</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {[p.role, p.unit].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <button
                          onClick={() => startEdit(p)}
                          className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
                          aria-label="עריכה"
                          title="עריכה"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          className="p-2 rounded-lg hover:bg-destructive/10 text-destructive"
                          aria-label="מחיקה"
                          title="מחיקה"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
