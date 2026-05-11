import * as React from "react";
import {
  Calendar as CalIcon,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  FileText,
  MessageSquare,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { Sheet } from "./ui/Sheet";
import { Button } from "./ui/Button";
import { Input, Textarea, Label } from "./ui/Input";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { Avatar } from "./ui/Avatar";
import { Chip } from "./ui/Chip";
import { Select } from "./ui/Select";
import { ParticipantPicker } from "./ParticipantPicker";
import { ActivityTimeline } from "./ActivityTimeline";
import { PriorityBadge, StatusBadge } from "./StatusBadge";
import { useStore } from "@/store/useStore";
import { PRIORITY_LABEL, STATUS_LABEL, T } from "@/lib/he";
import { cn, formatHebrewDate } from "@/lib/utils";
import type { Discussion, DiscussionStatus, Priority } from "@/types";

interface Props {
  open: boolean;
  discussion: Discussion | null;
  onClose: () => void;
  onDuplicate?: (template: Discussion) => void;
}

const NEXT_ACTIONS: Record<DiscussionStatus, { label: string; to: DiscussionStatus }[]> = {
  requires_scheduling: [{ label: T.markOccurred, to: "occurred" }],
  scheduled: [
    { label: T.markOccurred, to: "occurred" },
    { label: T.reschedule, to: "requires_scheduling" },
  ],
  occurred: [{ label: T.startSummary, to: "waiting_summary" }],
  waiting_summary: [{ label: "סיכום נכתב — לאישור", to: "waiting_approval" }],
  waiting_approval: [{ label: T.approveSummary, to: "waiting_distribution" }],
  waiting_distribution: [{ label: T.markDistributed, to: "completed" }],
  completed: [],
  cancelled: [],
};

export function DiscussionDetail({ open, discussion, onClose, onDuplicate }: Props) {
  const {
    participants,
    lookupParticipant,
    addParticipant,
    updateDiscussion,
    changeStatus,
    rescheduleDiscussion,
    removeDiscussion,
    addNote,
  } = useStore();

  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState("");
  const [requester, setRequester] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  const [participantIds, setParticipantIds] = React.useState<string[]>([]);
  const [leaderId, setLeaderId] = React.useState("");
  const [priority, setPriority] = React.useState<Priority>("normal");
  const [note, setNote] = React.useState("");

  // Re-hydrate state when discussion changes
  React.useEffect(() => {
    if (!discussion) return;
    setName(discussion.name);
    setRequester(discussion.requester);
    setNotes(discussion.notes ?? "");
    setSummary(discussion.summary ?? "");
    if (discussion.scheduledAt) {
      const d = new Date(discussion.scheduledAt);
      const pad = (n: number) => String(n).padStart(2, "0");
      setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    } else {
      setDate("");
      setTime("");
    }
    setParticipantIds(discussion.participantIds);
    setLeaderId(discussion.leaderId ?? "");
    setPriority(discussion.priority);
    setEditing(false);
    setNote("");
  }, [discussion]);

  if (!discussion) return null;

  const d = discussion;
  const unscheduled = !d.scheduledAt;
  const nextActions = NEXT_ACTIONS[d.status] ?? [];

  async function persistEdits() {
    if (!d) return;
    let scheduledAt: string | null = d.scheduledAt;
    if (date) {
      const iso = `${date}T${time || "09:00"}:00`;
      const parsed = new Date(iso);
      scheduledAt = Number.isNaN(parsed.getTime()) ? d.scheduledAt : parsed.toISOString();
    } else if (!date && d.scheduledAt) {
      scheduledAt = null;
    }

    const patch: Partial<Discussion> = {
      name: name.trim(),
      requester: requester.trim(),
      notes: notes.trim() || undefined,
      summary: summary.trim() || undefined,
      participantIds,
      leaderId: leaderId || null,
      priority,
    };

    // If scheduledAt changed, use reschedule (which adds a history event)
    if (scheduledAt !== d.scheduledAt) {
      await rescheduleDiscussion(d.id, scheduledAt);
      await updateDiscussion(d.id, patch, { kind: "note", text: "פרטי הדיון עודכנו" });
    } else {
      await updateDiscussion(d.id, patch, { kind: "note", text: "פרטי הדיון עודכנו" });
    }
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

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="full"
      title={
        <span className="flex items-center gap-2">
          <span className="truncate">{editing ? "עריכת דיון" : d.name}</span>
        </span>
      }
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

        {/* Date display */}
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
            {d.durationMinutes && (
              <span className="text-xs text-muted-foreground">
                · {d.durationMinutes} ד'
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <User size={14} className="text-muted-foreground" />
            <span className="text-muted-foreground">דורש:</span>
            <span className="font-medium">{d.requester}</span>
          </div>
          {d.leaderId && lookupParticipant(d.leaderId) && (
            <div className="mt-1 flex items-center gap-2 text-sm">
              <Sparkles size={14} className="text-muted-foreground" />
              <span className="text-muted-foreground">מוביל:</span>
              <span className="font-medium">{lookupParticipant(d.leaderId)?.name}</span>
            </div>
          )}
        </Card>

        {/* Quick next actions */}
        {nextActions.length > 0 && !editing && (
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
                  <ChevronRight size={14} />
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Participants */}
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
                  return (
                    <li key={id} className="flex items-center gap-2">
                      <Avatar name={p.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {p.name}
                          {p.id === d.leaderId && (
                            <Badge tone="accent" className="mr-1.5">
                              מוביל
                            </Badge>
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
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={4}
                />
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!summary.trim()) return;
                    await updateDiscussion(
                      d.id,
                      { summary: summary.trim(), status: d.requiresApproval ? "waiting_approval" : "waiting_distribution" },
                      { kind: "summary_changed", text: "סיכום נכתב" }
                    );
                  }}
                >
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
                    <Badge tone="muted" className="ms-auto">
                      {a.kind}
                    </Badge>
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
          <div className="space-y-4">
            <div>
              <Label>שם הדיון</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>{T.requester}</Label>
              <Input
                value={requester}
                onChange={(e) => setRequester(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{T.date}</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <Label>{T.time}</Label>
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  disabled={!date}
                />
              </div>
            </div>

            <div>
              <Label>{T.priority}</Label>
              <div className="flex gap-2">
                {(["normal", "high", "urgent"] as Priority[]).map((p) => (
                  <Chip
                    key={p}
                    active={priority === p}
                    onClick={() => setPriority(p)}
                    size="sm"
                  >
                    {PRIORITY_LABEL[p]}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <Label>{T.participants}</Label>
              <ParticipantPicker
                participants={participants}
                value={participantIds}
                onChange={setParticipantIds}
                onCreate={addParticipant}
              />
            </div>

            {participantIds.length > 0 && (
              <div>
                <Label>{T.leader}</Label>
                <Select
                  value={leaderId}
                  onChange={(e) => setLeaderId(e.target.value)}
                  options={[
                    { value: "", label: "ללא מוביל" },
                    ...participantIds
                      .map((id) => participants.find((p) => p.id === id))
                      .filter((p): p is NonNullable<typeof p> => !!p)
                      .map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </div>
            )}

            <div>
              <Label>{T.notes}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            <div>
              <Label>{T.summary}</Label>
              <Textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder={T.writeSummary}
                rows={5}
              />
            </div>

            {/* Status quick switch (edit only) */}
            <div>
              <Label>סטטוס</Label>
              <Select
                value={d.status}
                onChange={(e) => changeStatus(d.id, e.target.value as DiscussionStatus)}
                options={(Object.keys(STATUS_LABEL) as DiscussionStatus[])
                  .filter((s) => s !== "cancelled")
                  .map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
              />
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="sticky bottom-0 bg-background border-t border-border pt-3 pb-1 -mx-5 px-5 flex gap-2">
          {!editing ? (
            <>
              <Button variant="outline" size="md" onClick={() => setEditing(true)} className="flex-1">
                {T.edit}
              </Button>
              {onDuplicate && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDuplicate(d)}
                  title="שכפל דיון"
                >
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
            </>
          ) : (
            <>
              <Button variant="ghost" size="md" onClick={() => setEditing(false)} className="flex-1">
                {T.cancel}
              </Button>
              <Button size="md" onClick={persistEdits} className="flex-[2]">
                {T.save}
              </Button>
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}
