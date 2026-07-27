import * as React from "react";
import { ClipboardList } from "lucide-react";
import { Sheet } from "./ui/Sheet";
import { Input, Textarea, Label } from "./ui/Input";
import { Button } from "./ui/Button";
import { Select } from "./ui/Select";
import type { Profile, Task } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  profiles: Profile[];
  task?: Task | null;
  onSave: (data: { title: string; description?: string; responsibleId?: string }) => Promise<void>;
  onDelete?: () => void;
}

export function TaskSheet({ open, onClose, profiles, task, onSave, onDelete }: Props) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [responsibleId, setResponsibleId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setResponsibleId(task?.responsibleId ?? "");
  }, [open, task]);

  const canSave = title.trim().length > 0 && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        responsibleId: responsibleId || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const profileOptions = [
    { value: "", label: "ללא אחראי" },
    ...profiles.map((p) => ({ value: p.id, label: p.displayName })),
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <ClipboardList size={18} className="text-accent" />
          {task ? "עריכת משימה" : "משימה חדשה"}
        </span>
      }
      footer={
        <div className="flex gap-2">
          {task && onDelete && (
            <Button
              type="button"
              variant="ghost"
              className="flex-1 text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              מחק
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose} className={task && onDelete ? "" : "flex-1"}>
            ביטול
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave} className="flex-[2]">
            {saving ? "שומר..." : "שמור"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="task-title">כותרת *</Label>
          <Input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="לדוגמה: לסדר ישיבה שבועית"
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="task-desc">תיאור</Label>
          <Textarea
            id="task-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="פרטים נוספים..."
            rows={3}
          />
        </div>
        <div>
          <Label>אחראי</Label>
          <Select
            value={responsibleId}
            onChange={(e) => setResponsibleId(e.target.value)}
            options={profileOptions}
          />
        </div>
      </div>
    </Sheet>
  );
}
