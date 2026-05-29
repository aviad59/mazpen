import * as React from "react";
import { Sparkles } from "lucide-react";
import { Sheet } from "./ui/Sheet";
import { Input, Textarea, Label } from "./ui/Input";
import { Button } from "./ui/Button";
import { Switch } from "./ui/Switch";
import { Select } from "./ui/Select";
import { ParticipantPicker } from "./ParticipantPicker";
import { DateWindowPicker } from "./DateWindowPicker";
import { useStore } from "@/store/useStore";
import { T, RECURRENCE_LABEL, isPEDiscussion } from "@/lib/he";
import type { DateWindow, Discussion, Recurrence } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (d: Discussion) => void;
  template?: Partial<Discussion> | null;
}

export function QuickAddSheet({ open, onClose, onCreated, template }: Props) {
  const { participants, groups, addParticipant, createDiscussion } = useStore();

  const [name, setName] = React.useState("");
  const [dateWindow, setDateWindow] = React.useState<DateWindow>("this_week");
  const [participantIds, setParticipantIds] = React.useState<string[]>([]);
  const [leaderId, setLeaderId] = React.useState<string>("");
  const [requiresSummary, setRequiresSummary] = React.useState(true);
  const [requiresSubstrate, setRequiresSubstrate] = React.useState(true);
  const [recurrence, setRecurrence] = React.useState<Recurrence>("none");
  const [notes, setNotes] = React.useState("");
  const [durationMinutes, setDurationMinutes] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);
  const nameRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(template?.name ?? "");
    setDateWindow(template?.dateWindow ?? "this_week");
    setParticipantIds(template?.participantIds ?? []);
    setLeaderId(template?.leaderId ?? "");
    setRequiresSummary(template?.requiresSummary ?? true);
    setRequiresSubstrate(template?.requiresSubstrate ?? true);
    setRecurrence(template?.recurrence ?? "none");
    setNotes(template?.notes ?? "");
    setDurationMinutes(template?.durationMinutes?.toString() ?? "");
    setTimeout(() => nameRef.current?.focus(), 80);
  }, [open, template]);

  const isPE = isPEDiscussion(name);

  // Auto-select leader when participants change (skip when PE)
  React.useEffect(() => {
    if (isPE || participantIds.length === 0) return;
    const eligibleIds = participantIds.filter(
      (id) => !participants.find((p) => p.id === id)?.optional
    );
    if (!leaderId || !eligibleIds.includes(leaderId)) {
      setLeaderId(eligibleIds[0] ?? participantIds[0]);
    }
  }, [isPE, participantIds, leaderId, participants]);

  // Derive effective submission values — PE overrides state directly at render time
  const effectiveLeaderId = isPE ? "" : leaderId;
  const effectiveRequiresSummary = isPE ? false : requiresSummary;
  const effectiveRequiresSubstrate = isPE ? false : requiresSubstrate;

  const hasParticipants = participantIds.length > 0;
  const hasLeader = !!effectiveLeaderId && participantIds.includes(effectiveLeaderId);
  const canSubmit = !!name.trim() && hasParticipants && (isPE || hasLeader) && !submitting;

  const parsedDuration = durationMinutes.trim() ? parseInt(durationMinutes, 10) : undefined;

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const created = await createDiscussion({
        name: name.trim(),
        dateWindow,
        participantIds,
        leaderId: effectiveLeaderId || undefined,
        requiresSummary: effectiveRequiresSummary,
        requiresSubstrate: effectiveRequiresSubstrate,
        recurrence,
        durationMinutes: parsedDuration && !isNaN(parsedDuration) ? parsedDuration : undefined,
        notes: notes.trim() || undefined,
      });
      onCreated?.(created);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const leaderOptions = participantIds
    .map((id) => participants.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p && !p.optional)
    .map((p) => ({ value: p.id, label: p.name }));

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
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
            {T.cancel}
          </Button>
          <Button type="button" onClick={() => handleSubmit()} disabled={!canSubmit} className="flex-[2]">
            {submitting ? "שומר..." : T.create}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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

        <div>
          <Label>{T.window}</Label>
          <DateWindowPicker value={dateWindow} onChange={setDateWindow} />
        </div>

        <div>
          <Label>{T.participants} *</Label>
          <ParticipantPicker
            participants={participants}
            groups={groups}
            value={participantIds}
            onChange={setParticipantIds}
            onCreate={addParticipant}
          />
          {!hasParticipants && (
            <p className="text-[11px] text-muted-foreground mt-1">
              חובה להוסיף לפחות משתתף אחד. הראשון יהיה המוביל כברירת מחדל.
            </p>
          )}
        </div>

        {hasParticipants && (
          <div>
            <Label>{T.leader}{!isPE && " *"}</Label>
            {isPE ? (
              <div className="h-11 w-full rounded-lg border border-input bg-muted/40 px-3 flex items-center text-sm text-muted-foreground cursor-not-allowed">
                זיהינו שמדובר בפ&quot;ע/פ&quot;א — אין צורך במוביל
              </div>
            ) : (
              <Select
                value={leaderId}
                onChange={(e) => setLeaderId(e.target.value)}
                options={leaderOptions}
              />
            )}
          </div>
        )}

        <div>
          <Label>משך הדיון (דקות)</Label>
          <Input
            type="number"
            min={1}
            max={480}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            placeholder="לדוגמה: 60"
          />
        </div>

        <div className="rounded-lg bg-muted/50 p-3 space-y-2">
          <Switch checked={requiresSummary} onChange={setRequiresSummary} label={T.requiresSummary} disabled={isPE} />
          <Switch checked={requiresSubstrate} onChange={setRequiresSubstrate} label={T.requiresSubstrate} disabled={isPE} />
        </div>

        <div>
          <Label>{T.recurrence}</Label>
          <Select
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value as Recurrence)}
            options={(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => ({
              value: r,
              label: RECURRENCE_LABEL[r],
            }))}
          />
        </div>

        <div>
          <Label>{T.notes}</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="הקשר / נושא / הערות..."
            rows={3}
          />
        </div>
      </form>
    </Sheet>
  );
}
