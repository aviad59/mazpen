import * as React from "react";
import {
  Building2,
  Calendar as CalIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  FileText,
  MessageSquare,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";
import { Sheet } from "./ui/Sheet";
import { Button } from "./ui/Button";
import { Input, Textarea, Label } from "./ui/Input";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { Avatar } from "./ui/Avatar";
import { ActivityTimeline } from "./ActivityTimeline";
import { PriorityBadge, StatusBadge } from "./StatusBadge";
import { DiscussionEditForm, type EditState } from "./DiscussionEditForm";
import { useStore } from "@/store/useStore";
import { HOME_UNIT, STATUS_LABEL, T } from "@/lib/he";
import { cn, formatHebrewDate } from "@/lib/utils";
import type { Discussion, DiscussionStatus } from "@/types";

interface Props {
  open: boolean;
  discussion: Discussion | null;
  onClose: () => void;
  onDuplicate?: (template: Discussion) => void;
}

const NEXT_ACTIONS: Record<DiscussionStatus, { label: string; to: DiscussionStatus }[]> = {
  requires_scheduling: [{ label: T.markOccurred, to: "occurred" }],
  scheduled: [{ label: T.markOccurred, to: "occurred" }],
  occurred: [{ label: T.startSummary, to: "waiting_summary" }],
  waiting_summary: [{ label: "סיכום נכתב — לאישור", to: "waiting_approval" }],
  waiting_approval: [{ label: T.approveSummary, to: "waiting_distribution" }],
  waiting_distribution: [{ label: T.markDistributed, to: "completed" }],
  completed: [],
  cancelled: [],
};

const PREV_STATUS: Record<DiscussionStatus, DiscussionStatus | null> = {
  requires_scheduling: null,
  scheduled: "requires_scheduling",
  occurred: "scheduled",
  waiting_summary: "occurred",
  waiting_approval: "waiting_summary",
  waiting_distribution: "waiting_approval",
  completed: "waiting_distribution",
  cancelled: null,
};

const EMPTY_EDIT: EditState = {
  name: "",
  notes: "",
  summary: "",
  scheduledAt: null,
  participantIds: [],
  leaderId: "",
  priority: "normal",
};

export function DiscussionDetail({ open, discussion, onClose, onDuplicate }: Props) {
  const {
    lookupParticipant,
    updateDiscussion,
    changeStatus,
    rescheduleDiscussion,
    removeDiscussion,
    addNote,
  } = useStore();

  const [editing, setEditing] = React.useState(false);
  const [edit, setEdit] = React.useState<EditState>(EMPTY_EDIT);
  const [note, setNote] = React.useState("");
  const [draftSummary, setDraftSummary] = React.useState("");

  React.useEffect(() => {
    if (!discussion) return;
    setEdit({
      name: discussion.name,
      notes: discussion.notes ?? "",
      summary: discussion.summary ?? "",
      scheduledAt: discussion.scheduledAt,
      participantIds: discussion.participantIds,
      leaderId: discussion.leaderId ?? "",
      priority: discussion.priority,
    });
    setEditing(false);
    setNote("");
    setDraftSummary("");
  }, [discussion]);

  if (!discussion) return null;
  const d = discussion;
  const unscheduled = !d.scheduledAt;
  const nextActions = NEXT_ACTIONS[d.status] ?? [];
  const prevStatus = PREV_STATUS[d.status];

  async function persistEdits() {
    if (!d) return;
    const patch: Partial<Discussion> = {
      name: edit.name.trim(),
      notes: edit.notes.trim() || undefined,
      summary: edit.summary.trim() || undefined,
      participantIds: edit.participantIds,
      leaderId: edit.leaderId || null,
      priority: edit.priority,
    };
    if (edit.scheduledAt !== d.scheduledAt) {
      await rescheduleDiscussion(d.id, edit.scheduledAt);
    }
    await updateDiscussion(d.id, patch, { kind: "note", text: "פרטי הדיון עודכנו" });
    setEditing(false);
  }

  async function handleAddNote() {
    if (!note.trim()) return;
    await addNote(d.id, note);
    setNote("");
  }

  async function handleDelete() {
    if (!confirm("למחוק את הדיון לצמיתות?")) return;
    await removeDiscussion(d.id);
    onClose();
  }

  async function handleSaveSummary() {
    if (!draftSummary.trim()) return;
    await updateDiscussion(
      d.id,
      {
        summary: draftSummary.trim(),
        status: d.requiresApproval ? "waiting_approval" : "waiting_distribution",
      },
      { kind: "summary_changed", text: "סיכום נכתב" }
    );
    setDraftSummary("");
  }

  const footer = !editing ? (
    <div className="flex gap-2">
      <Button variant="outline" size="md" onClick={() => setEditing(true)} className="flex-1">
        {T.edit}
      </Button>
      {onDuplicate && (
        <Button variant="ghost" size="icon" onClick={() => onDuplicate(d)} title="שכפל דיון">
          <Copy size={16} />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDelete}
        title={T.delete}
        className="text-destructive"
      >
        <Trash2 size={16} />
      </Button>
    </div>
  ) : (
    <div className="flex gap-2">
      <Button variant="ghost" size="md" onClick={() => setEditing(false)} className="flex-1">
        {T.cancel}
      </Button>
      <Button size="md" onClick={persistEdits} className="flex-[2]">
        {T.save}
      </Button>
    </div>
  );

  const leader = d.leaderId ? lookupParticipant(d.leaderId) : undefined;

  // Distinct non-home units present among participants
  const externalUnitsList = Array.from(
    new Set(
      d.participantIds
        .map((id) => lookupParticipant(id)?.unit)
        .filter((u): u is string => !!u && u !== HOME_UNIT)
    )
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="full"
      title={<span className="truncate">{editing ? "עריכת דיון" : d.name}</span>}
      footer={footer}
    >
      <div className="space-y-5">
        {/* Status / priority row */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={d.status} />
          <PriorityBadge priority={d.priority} />
          {d.requiresSummary && <Badge tone="muted">דורש סיכום</Badge>}
          {d.requiresApproval && <Badge tone="muted">דורש אישור</Badge>}
          {d.requiresDistribution && <Badge tone="muted">דורש הפצה</Badge>}
        </div>

        {/* Date / leader / external units */}
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm">
            <CalIcon
              size={16}
              className={cn(unscheduled ? "text-destructive" : "text-accent")}
            />
            <span
              className={cn(
                "font-medium",
                unscheduled ? "text-destructive" : "text-foreground"
              )}
            >
              {unscheduled ? T.notScheduled : formatHebrewDate(d.scheduledAt)}
            </span>
          </div>
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

        {/* Quick actions */}
        {!editing && (nextActions.length > 0 || prevStatus) && (
          <div>
            <Label>פעולות מהירות</Label>
            <div className="flex flex-wrap gap-2">
              {nextActions.map((a) => (
                <Button
                  key={a.to}
                  size="sm"
                  variant={a.to === "completed" ? "primary" : "outline"}
                  onClick={() => changeStatus(d.id, a.to)}
                >
                  <CheckCircle2 size={14} />
                  {a.label}
                  <ChevronLeft size={14} />
                </Button>
              ))}
              {prevStatus && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => changeStatus(d.id, prevStatus)}
                  title={`חזרה ל"${STATUS_LABEL[prevStatus]}"`}
                >
                  <Undo2 size={14} />
                  חזרה ל{STATUS_LABEL[prevStatus]}
                </Button>
              )}
              {d.status === "scheduled" && d.scheduledAt && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => rescheduleDiscussion(d.id, null)}
                >
                  <ChevronRight size={14} />
                  תזמן מחדש
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Participants list */}
        {!editing && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Users size={14} /> {T.participants}
              </h3>
              <span className="text-xs text-muted-foreground">
                {d.participantIds.length}
              </span>
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
                          {p.id === d.leaderId && (
                            <Badge tone="accent">מוביל</Badge>
                          )}
                          {isExternal && (
                            <Badge tone="warning">חיצוני</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {[p.role, p.unit].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {/* Notes */}
        {!editing && d.notes && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
              <MessageSquare size={14} /> {T.notes}
            </h3>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{d.notes}</p>
          </Card>
        )}

        {/* Summary */}
        {!editing && d.requiresSummary && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
              <FileText size={14} /> {T.summary}
            </h3>
            {d.summary ? (
              <p className="text-sm text-foreground/80 whitespace-pre-wrap">{d.summary}</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">טרם נכתב סיכום.</p>
                <Textarea
                  placeholder={T.writeSummary}
                  value={draftSummary}
                  onChange={(e) => setDraftSummary(e.target.value)}
                  rows={4}
                />
                <Button size="sm" onClick={handleSaveSummary} disabled={!draftSummary.trim()}>
                  שמור סיכום והתקדם
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* Attachments */}
        {!editing && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
              <Paperclip size={14} /> {T.attachments}
            </h3>
            {d.attachments.length === 0 ? (
              <p className="text-xs text-muted-foreground">אין צרופות.</p>
            ) : (
              <ul className="space-y-2">
                {d.attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-sm">
                    <Paperclip size={12} className="text-muted-foreground" />
                    <span className="truncate">{a.name}</span>
                    <Badge tone="muted" className="ms-auto">{a.kind}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {/* Add note */}
        {!editing && (
          <Card className="p-4">
            <Label>הוסף הערה / עדכון</Label>
            <div className="flex gap-2">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={T.addNote}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddNote();
                  }
                }}
              />
              <Button size="md" onClick={handleAddNote} disabled={!note.trim()}>
                <Send size={16} />
              </Button>
            </div>
          </Card>
        )}

        {/* History */}
        {!editing && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
              <Clock size={14} /> {T.history}
            </h3>
            <ActivityTimeline history={d.history} />
          </Card>
        )}

        {/* EDIT mode */}
        {editing && (
          <DiscussionEditForm
            discussion={d}
            state={edit}
            onChange={(patch) => setEdit((s) => ({ ...s, ...patch }))}
          />
        )}
      </div>
    </Sheet>
  );
}
