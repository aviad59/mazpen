import * as React from "react";
import {
  Building2,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Copy,
  FileStack,
  MessageSquare,
  Send,
  Share2,
  Sparkles,
  Timer,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";
import { Sheet } from "./ui/Sheet";
import { Button } from "./ui/Button";
import { Input, Label } from "./ui/Input";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { Avatar } from "./ui/Avatar";
import { ActivityTimeline } from "./ActivityTimeline";
import { StatusBadge } from "./StatusBadge";
import { DiscussionEditForm, type EditState } from "./DiscussionEditForm";
import { useStore } from "@/store/useStore";
import { HOME_UNIT, RECURRENCE_LABEL, STATUS_LABEL, T, WINDOW_LABEL } from "@/lib/he";
import { cn } from "@/lib/utils";
import type { Discussion, DiscussionStatus } from "@/types";

interface Props {
  open: boolean;
  discussion: Discussion | null;
  onClose: () => void;
  onDuplicate?: (template: Discussion) => void;
}

/** Dynamic next actions based on status + requiresSummary flag. */
function getNextActions(d: Discussion): { label: string; to: DiscussionStatus }[] {
  switch (d.status) {
    case "new":
      return [{ label: T.markCoordinated, to: "coordinated" }];
    case "coordinated":
      if (d.requiresSummary) {
        return [{ label: "הדיון התקיים — ממתין לסיכום", to: "waiting_summary" }];
      }
      return [{ label: T.markOccurred, to: "occurred" }];
    case "waiting_summary":
      return [{ label: "סיכום הושלם — הפצה", to: "distributed" }];
    case "waiting_approval":
      return [{ label: T.approveSummary, to: "distributed" }];
    default:
      return [];
  }
}

const PREV_STATUS: Record<DiscussionStatus, DiscussionStatus | null> = {
  new: null,
  coordinated: "new",
  occurred: "coordinated",
  waiting_summary: "coordinated",
  waiting_approval: "waiting_summary",
  distributed: "waiting_summary",
  cancelled: null,
};

const EMPTY_EDIT: EditState = {
  name: "",
  notes: "",
  dateWindow: "unspecified",
  participantIds: [],
  leaderId: "",
  requiresSummary: true,
  requiresSubstrate: true,
  recurrence: "none",
  durationMinutes: undefined,
};

export function DiscussionDetail({ open, discussion, onClose, onDuplicate }: Props) {
  const { lookupParticipant, updateDiscussion, changeStatus, setDateWindow, removeDiscussion, addNote } = useStore();

  const [editing, setEditing] = React.useState(false);
  const [edit, setEdit] = React.useState<EditState>(EMPTY_EDIT);
  const [note, setNote] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!discussion) return;
    setEdit({
      name: discussion.name,
      notes: discussion.notes ?? "",
      dateWindow: discussion.dateWindow,
      participantIds: discussion.participantIds,
      leaderId: discussion.leaderId ?? "",
      requiresSummary: discussion.requiresSummary,
      requiresSubstrate: discussion.requiresSubstrate,
      recurrence: discussion.recurrence,
      durationMinutes: discussion.durationMinutes,
    });
    setEditing(false);
    setNote("");
  }, [discussion]);

  if (!discussion) return null;
  const d = discussion;
  const nextActions = getNextActions(d);
  const prevStatus = PREV_STATUS[d.status];

  const editIsValid =
    edit.name.trim().length > 0 &&
    edit.participantIds.length > 0 &&
    !!edit.leaderId &&
    edit.participantIds.includes(edit.leaderId);

  async function persistEdits() {
    if (!d || !editIsValid) return;
    const patch: Partial<Discussion> = {
      name: edit.name.trim(),
      notes: edit.notes.trim() || undefined,
      participantIds: edit.participantIds,
      leaderId: edit.leaderId,
      requiresSummary: edit.requiresSummary,
      requiresSubstrate: edit.requiresSubstrate,
      recurrence: edit.recurrence,
      durationMinutes: edit.durationMinutes,
    };
    if (edit.dateWindow !== d.dateWindow) {
      await setDateWindow(d.id, edit.dateWindow);
    }
    await updateDiscussion(d.id, patch, { kind: "note", text: "פרטי הדיון עודכנו" });
    setEditing(false);
  }

  async function handleAddNote() {
    if (!note.trim()) return;
    await addNote(d.id, note);
    setNote("");
    setEdit((s) => ({
      ...s,
      notes: s.notes ? s.notes + "\n" + note.trim() : note.trim(),
    }));
  }

  async function handleDelete() {
    if (!confirm("למחוק את הדיון לצמיתות?")) return;
    await removeDiscussion(d.id);
    onClose();
  }

  async function handleShare() {
    const url = `${window.location.origin}${window.location.pathname}?id=${d.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: d.name, url });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard not available — use legacy execCommand
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const footer = !editing ? (
    <div className="flex gap-2">
      <Button variant="outline" size="md" onClick={() => setEditing(true)} className="flex-1">{T.edit}</Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleShare}
        title={copied ? "הועתק!" : "שתף קישור"}
        className={cn(copied && "text-green-500")}
      >
        {copied ? <CheckCircle2 size={16} /> : <Share2 size={16} />}
      </Button>
      {onDuplicate && (
        <Button variant="ghost" size="icon" onClick={() => onDuplicate(d)} title="שכפל דיון">
          <Copy size={16} />
        </Button>
      )}
      <Button variant="ghost" size="icon" onClick={handleDelete} title={T.delete} className="text-destructive">
        <Trash2 size={16} />
      </Button>
    </div>
  ) : (
    <div className="flex gap-2">
      <Button variant="ghost" size="md" onClick={() => setEditing(false)} className="flex-1">{T.cancel}</Button>
      <Button size="md" onClick={persistEdits} disabled={!editIsValid} className="flex-[2]">{T.save}</Button>
    </div>
  );

  const leader = d.leaderId ? lookupParticipant(d.leaderId) : undefined;
  const externalUnitsList = Array.from(
    new Set(d.participantIds.map((id) => lookupParticipant(id)?.unit).filter((u): u is string => !!u && u !== HOME_UNIT))
  );

  return (
    <Sheet open={open} onClose={onClose} size="full" title={<span className="truncate">{editing ? "עריכת דיון" : d.name}</span>} footer={footer}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={d.status} />
          {d.requiresSummary && <Badge tone="muted">דורש סיכום + הפצה</Badge>}
          {d.requiresSubstrate && <Badge tone="muted"><FileStack size={10} />דורש מצע</Badge>}
          {d.recurrence !== "none" && <Badge tone="accent">{RECURRENCE_LABEL[d.recurrence]}</Badge>}
        </div>

        <Card className="p-4">
          <div className={cn("flex items-center gap-2 text-sm font-medium", d.dateWindow === "this_week" ? "text-accent" : "text-foreground")}>
            <CalendarRange size={16} />
            <span>{WINDOW_LABEL[d.dateWindow]}</span>
          </div>
          {d.durationMinutes && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <Timer size={14} className="text-muted-foreground" />
              <span className="text-muted-foreground">משך:</span>
              <span className="font-medium">{d.durationMinutes} דקות</span>
            </div>
          )}
          {leader && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <Sparkles size={14} className="text-muted-foreground" />
              <span className="text-muted-foreground">מוביל:</span>
              <span className="font-medium">{leader.name}</span>
            </div>
          )}
          {externalUnitsList.length > 0 && (
            <div className="mt-2 flex items-start gap-2 text-sm">
              <Building2 size={14} className="text-warning mt-[2px]" />
              <div className="leading-snug">
                <span className="text-muted-foreground">{T.externalUnits}:</span>{" "}
                <span className="font-medium">{externalUnitsList.join(" · ")}</span>
              </div>
            </div>
          )}
        </Card>

        {!editing && (nextActions.length > 0 || prevStatus) && (
          <div>
            <Label>פעולות מהירות</Label>
            <div className="flex flex-wrap gap-2">
              {nextActions.map((a) => (
                <Button
                  key={a.to}
                  size="sm"
                  variant={a.to === "distributed" || a.to === "occurred" ? "primary" : "outline"}
                  onClick={() => changeStatus(d.id, a.to)}
                >
                  <CheckCircle2 size={14} />{a.label}
                  {a.to !== "distributed" && a.to !== "occurred" && <ChevronLeft size={14} />}
                </Button>
              ))}
              {prevStatus && (
                <Button size="sm" variant="ghost" onClick={() => changeStatus(d.id, prevStatus)}>
                  <Undo2 size={14} />חזרה ל{STATUS_LABEL[prevStatus]}
                </Button>
              )}
            </div>
          </div>
        )}

        {!editing && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><Users size={14} /> {T.participants}</h3>
              <span className="text-xs text-muted-foreground">{d.participantIds.length}</span>
            </div>
            {d.participantIds.length === 0 ? (
              <p className="text-xs text-muted-foreground">אין משתתפים.</p>
            ) : (
              <ul className="space-y-2">
                {d.participantIds.map((id) => {
                  const p = lookupParticipant(id);
                  if (!p) return null;
                  const isExternal = !!p.unit && p.unit !== HOME_UNIT;
                  return (
                    <li key={id} className="flex items-center gap-2">
                      <Avatar name={p.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate flex items-center gap-1.5">
                          <span className="truncate">{p.name}</span>
                          {p.id === d.leaderId && <Badge tone="accent">מוביל</Badge>}
                          {isExternal && <Badge tone="warning">חיצוני</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{[p.role, p.unit].filter(Boolean).join(" · ")}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {!editing && d.notes && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><MessageSquare size={14} /> {T.notes}</h3>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{d.notes}</p>
          </Card>
        )}

        {!editing && (
          <Card className="p-4">
            <Label>הוסף לשדה ההערות</Label>
            <div className="flex gap-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={T.addNote}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddNote(); } }} />
              <Button size="md" onClick={handleAddNote} disabled={!note.trim()}><Send size={16} /></Button>
            </div>
          </Card>
        )}

        {!editing && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3"><Clock size={14} /> {T.history}</h3>
            <ActivityTimeline history={d.history} />
          </Card>
        )}

        {editing && (
          <DiscussionEditForm discussion={d} state={edit} onChange={(patch) => setEdit((s) => ({ ...s, ...patch }))} />
        )}
      </div>
    </Sheet>
  );
}
