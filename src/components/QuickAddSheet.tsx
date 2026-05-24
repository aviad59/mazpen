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
import { T, RECURRENCE_LABEL } from "@/lib/he";
import type { DateWindow, Discussion, Recurrence } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (d: Discussion) => void;
  template?: Partial<Discussion> | null;
}

export function QuickAddSheet({ open, onClose, onCreated, template }: Props) {
  const { participants, addParticipant, createDiscussion } = useStore();

  const [name, setName] = React.useState("");
  const [dateWindow, setDateWindow] = React.useState<DateWindow>("this_week");
  const [participantIds, setParticipantIds] = React.useState<string[]>([]);
  const [leaderId, setLeaderId] = React.useState<string>("");
  const [requiresSummary, setRequiresSummary] = React.useState(true);
  const [requiresSubstrate, setRequiresSubstrate] = React.useState(true);
  const [recurrence, setRecurrence] = React.useState<Recurrence>("none");
  const [notes, setNotes] = React.useState("");
  const [showAdvanced, setShowAdvanced] = React.useState(false);
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
    setShowAdvanced(false);
    setTimeout(() => nameRef.current?.focus(), 80);
  }, [open, template]);

  // Auto-default the leader to the first participant whenever the leader is
  // empty or no longer in the participant list. Leader is required.
  React.useEffect(() => {
    if (participantIds.length === 0) return;
    if (!leaderId || !participantIds.includes(leaderId)) {
      setLeaderId(participantIds[0]);
    }
  }, [participantIds, leaderId]);

  const hasParticipants = participantIds.length > 0;
  const hasLeader = !!leaderId && participantIds.includes(leaderId);
  const canSubmit = !!name.trim() && hasParticipants && hasLeader && !submitting;

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const created = await createDiscussion({
        name: name.trim(),
        dateWindow,
        participantIds,
        leaderId,
        requiresSummary,
        requiresSubstrate,
        recurrence,
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
    .filter((p): p is NonNullable<typeof p> => !!p)
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
          <Button
            type="button"
            onClick={() => handleSubmit()}
            disabled={!canSubmit}
            className="flex-[2]"
          >
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
            <Label>{T.leader} *</Label>
            <Select
              value={leaderId}
              onChange={(e) => setLeaderId(e.target.value)}
              options={leaderOptions}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              ברירת מחדל: המשתתף הראשון שנוסף.
            </p>
          </div>
        )}

        <div className="rounded-lg bg-muted/50 p-3 space-y-2">
          <Switch
            checked={requiresSummary}
            onChange={setRequiresSummary}
            label={T.requiresSummary}
          />
          <Switch
            checked={requiresSubstrate}
            onChange={setRequiresSubstrate}
            label={T.requiresSubstrate}
          />
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

        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className="text-sm text-accent font-medium hover:opacity-80"
        >
          {showAdvanced ? "− הסתר מתקדם" : "+ אפשרויות מתקדמות"}
        </button>

        {showAdvanced && (
          <div className="space-y-4 pt-2 border-t border-border">
            <div>
              <Label>{T.notes}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="הקשר / נושא / הערות..."
                rows={3}
              />
            </div>
          </div>
        )}
      </form>
    </Sheet>
  );
}
