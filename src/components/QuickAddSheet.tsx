import * as React from "react";
import { Sparkles, Calendar as CalIcon, Clock } from "lucide-react";
import { Sheet } from "./ui/Sheet";
import { Input, Textarea, Label } from "./ui/Input";
import { Button } from "./ui/Button";
import { Switch } from "./ui/Switch";
import { Chip } from "./ui/Chip";
import { Select } from "./ui/Select";
import { ParticipantPicker } from "./ParticipantPicker";
import { useStore } from "@/store/useStore";
import { T, PRIORITY_LABEL } from "@/lib/he";
import type { Discussion, Priority } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (d: Discussion) => void;
  /** Pre-fill from another discussion (duplicate). */
  template?: Partial<Discussion> | null;
}

const DEFAULT_REQUESTERS = ["אל\"ם אמיר כהן", "סא\"ל נועה לוי", "אל\"ם איתן רוזן", "סא\"ל קרן שמש"];

export function QuickAddSheet({ open, onClose, onCreated, template }: Props) {
  const { participants, addParticipant, createDiscussion } = useStore();

  const [name, setName] = React.useState("");
  const [requester, setRequester] = React.useState("");
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  const [participantIds, setParticipantIds] = React.useState<string[]>([]);
  const [leaderId, setLeaderId] = React.useState<string>("");
  const [priority, setPriority] = React.useState<Priority>("normal");
  const [requiresSummary, setRequiresSummary] = React.useState(true);
  const [requiresApproval, setRequiresApproval] = React.useState(false);
  const [requiresDistribution, setRequiresDistribution] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const nameRef = React.useRef<HTMLInputElement>(null);

  // Reset / prefill on open
  React.useEffect(() => {
    if (!open) return;
    setName(template?.name ?? "");
    setRequester(template?.requester ?? "");
    setDate("");
    setTime("");
    setParticipantIds(template?.participantIds ?? []);
    setLeaderId(template?.leaderId ?? "");
    setPriority(template?.priority ?? "normal");
    setRequiresSummary(template?.requiresSummary ?? true);
    setRequiresApproval(template?.requiresApproval ?? false);
    setRequiresDistribution(template?.requiresDistribution ?? false);
    setNotes(template?.notes ?? "");
    setShowAdvanced(false);

    // focus name field
    setTimeout(() => nameRef.current?.focus(), 80);
  }, [open, template]);

  const combinedDate = React.useMemo(() => {
    if (!date) return null;
    const iso = time ? `${date}T${time}:00` : `${date}T09:00:00`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }, [date, time]);

  const canSubmit = name.trim() && requester.trim() && !submitting;

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const created = await createDiscussion({
        name: name.trim(),
        requester: requester.trim(),
        scheduledAt: combinedDate,
        participantIds,
        leaderId: leaderId || null,
        priority,
        requiresSummary,
        requiresApproval,
        requiresDistribution,
        notes: notes.trim() || undefined,
      });
      onCreated?.(created);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const leaderOptions = [
    { value: "", label: "ללא מוביל" },
    ...participantIds
      .map((id) => participants.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Sparkles size={18} className="text-accent" />
          {T.newDiscussion}
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <Label htmlFor="qa-name">שם הדיון *</Label>
          <Input
            id="qa-name"
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="לדוגמה: סיכום שבועי תמונת מצב"
            required
          />
        </div>

        {/* Requester */}
        <div>
          <Label htmlFor="qa-requester">{T.requester} *</Label>
          <Input
            id="qa-requester"
            value={requester}
            onChange={(e) => setRequester(e.target.value)}
            list="qa-requesters"
            placeholder={'לדוגמה: סא"ל נועה לוי'}
            required
          />
          <datalist id="qa-requesters">
            {DEFAULT_REQUESTERS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>

        {/* Date + time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="qa-date">
              <CalIcon size={11} className="inline -mt-0.5 ml-1" />
              {T.date} (אופציונלי)
            </Label>
            <Input
              id="qa-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="qa-time">
              <Clock size={11} className="inline -mt-0.5 ml-1" />
              {T.time}
            </Label>
            <Input
              id="qa-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={!date}
            />
          </div>
        </div>
        {!date && (
          <p className="-mt-2 text-[11px] text-muted-foreground">
            ניתן לשמור ללא תאריך — הדיון יופיע בסעיף "ממתינים לתיאום".
          </p>
        )}

        {/* Quick priority pills */}
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

        {/* Participants */}
        <div>
          <Label>{T.participants}</Label>
          <ParticipantPicker
            participants={participants}
            value={participantIds}
            onChange={setParticipantIds}
            onCreate={addParticipant}
          />
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className="text-sm text-accent font-medium hover:opacity-80"
        >
          {showAdvanced ? "− הסתר מתקדם" : "+ אפשרויות מתקדמות"}
        </button>

        {showAdvanced && (
          <div className="space-y-4 pt-2 border-t border-border">
            {participantIds.length > 0 && (
              <div>
                <Label>{T.leader}</Label>
                <Select
                  value={leaderId}
                  onChange={(e) => setLeaderId(e.target.value)}
                  options={leaderOptions}
                />
              </div>
            )}

            <div>
              <Label>{T.notes}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="הקשר / נושא / הערות..."
                rows={3}
              />
            </div>

            <div className="rounded-lg bg-muted/50 p-3 space-y-3">
              <Switch
                checked={requiresSummary}
                onChange={setRequiresSummary}
                label={T.requiresSummary}
              />
              <Switch
                checked={requiresApproval}
                onChange={setRequiresApproval}
                disabled={!requiresSummary}
                label={T.requiresApproval}
              />
              <Switch
                checked={requiresDistribution}
                onChange={setRequiresDistribution}
                disabled={!requiresSummary}
                label={T.requiresDistribution}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2 sticky bottom-0 bg-background pb-1">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
            {T.cancel}
          </Button>
          <Button type="submit" disabled={!canSubmit} className="flex-[2]">
            {submitting ? "שומר..." : T.create}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
