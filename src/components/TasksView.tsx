import * as React from "react";
import { Check, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./ui/Card";
import { TaskSheet } from "./TaskSheet";
import { useTaskStore, createTask, updateTask, removeTask } from "@/store/useTaskStore";
import type { Task } from "@/types";

interface Props {
  addOpen?: boolean;
  onAddClose?: () => void;
}

export function TasksView({ addOpen = false, onAddClose }: Props) {
  const { tasks, profiles, loading } = useTaskStore();
  const [editOpen, setEditOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<Task | null>(null);

  const sheetOpen = addOpen || editOpen;

  // When the nav + button opens the sheet, make sure we're in "new task" mode
  React.useEffect(() => {
    if (addOpen) setEditingTask(null);
  }, [addOpen]);

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  function openEdit(t: Task) {
    setEditingTask(t);
    setEditOpen(true);
  }

  function closeSheet() {
    setEditOpen(false);
    setEditingTask(null);
    onAddClose?.();
  }

  async function handleSave(data: { title: string; description?: string; responsibleId?: string }) {
    if (editingTask) {
      await updateTask(editingTask.id, data);
    } else {
      await createTask(data);
    }
  }

  async function handleDelete() {
    if (!editingTask) return;
    await removeTask(editingTask.id);
    closeSheet();
  }

  async function handleToggle(id: string, currentDone: boolean) {
    await updateTask(id, { done: !currentDone });
  }

  const lookupName = (id?: string) => profiles.find((p) => p.id === id)?.displayName;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        טוען משימות...
      </div>
    );
  }

  return (
    <div className="relative pb-24">
      <div className="p-4 space-y-4 max-w-xl mx-auto">
        {tasks.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-16">
            אין משימות עדיין. לחץ + כדי להוסיף.
          </div>
        )}

        {open.length > 0 && (
          <section className="space-y-2">
            {open.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                responsibleName={lookupName(t.responsibleId)}
                onToggle={() => handleToggle(t.id, t.done)}
                onEdit={() => openEdit(t)}
              />
            ))}
          </section>
        )}

        {done.length > 0 && (
          <section>
            <p className="text-xs text-muted-foreground px-1 mb-2">בוצע ({done.length})</p>
            <div className="space-y-2 opacity-60">
              {done.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  responsibleName={lookupName(t.responsibleId)}
                  onToggle={() => handleToggle(t.id, t.done)}
                  onEdit={() => openEdit(t)}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      <TaskSheet
        open={sheetOpen}
        onClose={closeSheet}
        profiles={profiles}
        task={editingTask}
        onSave={handleSave}
        onDelete={editingTask ? handleDelete : undefined}
      />
    </div>
  );
}

function TaskRow({
  task,
  responsibleName,
  onToggle,
  onEdit,
}: {
  task: Task;
  responsibleName?: string;
  onToggle: () => void;
  onEdit: () => void;
}) {
  return (
    <Card className="flex items-start gap-3 p-3 cursor-pointer hover:shadow-md transition-shadow" onClick={onEdit}>
      <button
        className={cn(
          "mt-0.5 shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors",
          task.done
            ? "bg-accent border-accent text-accent-foreground"
            : "border-muted-foreground/40 hover:border-accent"
        )}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        aria-label={task.done ? "סמן כלא בוצע" : "סמן כבוצע"}
      >
        {task.done && <Check size={12} strokeWidth={3} />}
      </button>

      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium leading-snug", task.done && "line-through text-muted-foreground")}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
        )}
        {responsibleName && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <User size={11} />
            {responsibleName}
          </p>
        )}
      </div>
    </Card>
  );
}
