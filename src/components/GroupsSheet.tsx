import * as React from "react";
import { Plus, Pencil, Trash2, X, Check, Layers } from "lucide-react";
import { Sheet } from "./ui/Sheet";
import { Input, Label } from "./ui/Input";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
import { EmptyState } from "./ui/EmptyState";
import { ParticipantPicker } from "./ParticipantPicker";
import { useStore } from "@/store/useStore";
import type { ParticipantGroup } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface DraftFields {
  name: string;
  participantIds: string[];
}

const EMPTY: DraftFields = { name: "", participantIds: [] };

export function GroupsSheet({ open, onClose }: Props) {
  const { participants, groups, addGroup, updateGroup, removeGroup } = useStore();

  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState<DraftFields>(EMPTY);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<DraftFields>(EMPTY);

  React.useEffect(() => {
    if (!open) {
      setCreating(false);
      setDraft(EMPTY);
      setEditingId(null);
    }
  }, [open]);

  async function handleCreate() {
    const name = draft.name.trim();
    if (!name || draft.participantIds.length === 0) return;
    await addGroup({ name, participantIds: draft.participantIds });
    setDraft(EMPTY);
    setCreating(false);
  }

  function startEdit(g: ParticipantGroup) {
    setEditingId(g.id);
    setEditDraft({ name: g.name, participantIds: g.participantIds });
  }

  async function commitEdit() {
    if (!editingId) return;
    const original = groups.find((g) => g.id === editingId);
    if (!original) return;
    await updateGroup({
      ...original,
      name: editDraft.name.trim() || original.name,
      participantIds: editDraft.participantIds,
    });
    setEditingId(null);
  }

  async function handleDelete(g: ParticipantGroup) {
    if (!confirm(`למחוק את הקבוצה "${g.name}"?`)) return;
    await removeGroup(g.id);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="full"
      title={
        <span className="flex items-center gap-2">
          <Layers size={18} />
          ניהול קבוצות
        </span>
      }
      footer={
        creating ? (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="md"
              onClick={() => { setCreating(false); setDraft(EMPTY); }}
              className="flex-1"
            >
              ביטול
            </Button>
            <Button
              size="md"
              onClick={handleCreate}
              disabled={!draft.name.trim() || draft.participantIds.length === 0}
              className="flex-[2]"
            >
              שמור קבוצה
            </Button>
          </div>
        ) : (
          <Button onClick={() => setCreating(true)} className="w-full" size="md">
            <Plus size={16} />
            הוסף קבוצה חדשה
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {creating && (
          <Card className="p-4 border-accent/40 bg-accent/5 space-y-3">
            <div className="text-sm font-semibold">קבוצה חדשה</div>
            <div>
              <Label>שם הקבוצה *</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
                placeholder="לדוגמה: צוות מבצעים"
              />
            </div>
            <div>
              <Label>משתתפים *</Label>
              <ParticipantPicker
                participants={participants}
                value={draft.participantIds}
                onChange={(ids) => setDraft({ ...draft, participantIds: ids })}
              />
              {draft.participantIds.length === 0 && (
                <p className="text-[11px] text-destructive mt-1">קבוצה חייבת לכלול לפחות משתתף אחד.</p>
              )}
            </div>
          </Card>
        )}

        {groups.length === 0 && !creating ? (
          <EmptyState
            icon={<Layers size={32} />}
            title="אין קבוצות עדיין"
            hint="הוסף קבוצה ראשונה בלחיצה על הכפתור למטה"
          />
        ) : (
          <ul className="space-y-2">
            {groups.map((g) => {
              const isEditing = editingId === g.id;
              const memberNames = g.participantIds
                .map((id) => participants.find((p) => p.id === id)?.name)
                .filter(Boolean)
                .join(", ");
              return (
                <li key={g.id}>
                  <Card className="p-3">
                    {isEditing ? (
                      <div className="space-y-3">
                        <Input
                          value={editDraft.name}
                          onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                          placeholder="שם הקבוצה"
                          autoFocus
                        />
                        <ParticipantPicker
                          participants={participants}
                          value={editDraft.participantIds}
                          onChange={(ids) => setEditDraft({ ...editDraft, participantIds: ids })}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="flex-1">
                            <X size={14} /> ביטול
                          </Button>
                          <Button size="sm" onClick={commitEdit} className="flex-[2]">
                            <Check size={14} /> שמור
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold">{g.name}</span>
                            <Badge tone="muted">{g.participantIds.length} משתתפים</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {memberNames}
                          </div>
                        </div>
                        <button
                          onClick={() => startEdit(g)}
                          className="p-2 rounded-lg hover:bg-muted text-muted-foreground shrink-0"
                          aria-label="עריכה"
                          title="עריכה"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(g)}
                          className="p-2 rounded-lg hover:bg-destructive/10 text-destructive shrink-0"
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
