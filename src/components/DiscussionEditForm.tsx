import * as React from "react";
import { Input, Textarea, Label } from "./ui/Input";
import { Select } from "./ui/Select";
import { Switch } from "./ui/Switch";
import { ParticipantPicker } from "./ParticipantPicker";
import { DateWindowPicker } from "./DateWindowPicker";
import { useStore } from "@/store/useStore";
import { RECURRENCE_LABEL, STATUS_LABEL, T } from "@/lib/he";
import type { DateWindow, Discussion, DiscussionStatus, Recurrence } from "@/types";

export interface EditState {
  name: string;
  notes: string;
  dateWindow: DateWindow;
  participantIds: string[];
  leaderId: string;
  requiresSummary: boolean;
  requiresSubstrate: boolean;
  recurrence: Recurrence;
  durationMinutes?: number;
}

interface Props {
  discussion: Discussion;
  state: EditState;
  onChange: (patch: Partial<EditState>) => void;
}

export function DiscussionEditForm({ discussion, state, onChange }: Props) {
  const { participants, groups, addParticipant, changeStatus } = useStore();

  React.useEffect(() => {
    if (state.participantIds.length === 0) return;
    if (!state.leaderId || !state.participantIds.includes(state.leaderId)) {
      onChange({ leaderId: state.participantIds[0] });
    }
  }, [state.participantIds, state.leaderId, onChange]);

  const leaderOptions = state.participantIds
    .map((id) => participants.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({ value: p.id, label: p.name }));

  return (
    <div className="space-y-4">
      <div>
        <Label>שם הדיון</Label>
        <Input value={state.name} onChange={(e) => onChange({ name: e.target.value })} />
      </div>

      <div>
        <Label>{T.window}</Label>
        <DateWindowPicker value={state.dateWindow} onChange={(v) => onChange({ dateWindow: v })} />
      </div>

      <div>
        <Label>{T.participants} *</Label>
        <ParticipantPicker
          participants={participants}
          groups={groups}
          value={state.participantIds}
          onChange={(ids) => onChange({ participantIds: ids })}
          onCreate={addParticipant}
        />
        {state.participantIds.length === 0 && (
          <p className="text-[11px] text-destructive mt-1">דיון חייב לכלול לפחות משתתף אחד.</p>
        )}
      </div>

      {state.participantIds.length > 0 && (
        <div>
          <Label>{T.leader} *</Label>
          <Select
            value={state.leaderId}
            onChange={(e) => onChange({ leaderId: e.target.value })}
            options={leaderOptions}
          />
        </div>
      )}

      <div>
        <Label>משך הדיון (דקות)</Label>
        <Input
          type="number"
          min={1}
          max={480}
          value={state.durationMinutes?.toString() ?? ""}
          onChange={(e) => {
            const v = e.target.value.trim();
            onChange({ durationMinutes: v ? parseInt(v, 10) : undefined });
          }}
          placeholder="לדוגמה: 60"
        />
      </div>

      <div>
        <Label>{T.notes}</Label>
        <Textarea
          value={state.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={3}
        />
      </div>

      <div className="rounded-lg bg-muted/50 p-3 space-y-2">
        <Switch checked={state.requiresSummary} onChange={(v) => onChange({ requiresSummary: v })} label={T.requiresSummary} />
        <Switch checked={state.requiresSubstrate} onChange={(v) => onChange({ requiresSubstrate: v })} label={T.requiresSubstrate} />
      </div>

      <div>
        <Label>{T.recurrence}</Label>
        <Select
          value={state.recurrence}
          onChange={(e) => onChange({ recurrence: e.target.value as Recurrence })}
          options={(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => ({
            value: r,
            label: RECURRENCE_LABEL[r],
          }))}
        />
      </div>

      <div>
        <Label>סטטוס (לעריכה ישירה)</Label>
        <Select
          value={discussion.status}
          onChange={(e) => changeStatus(discussion.id, e.target.value as DiscussionStatus)}
          options={(["new", "coordinated", "occurred", "waiting_summary", "waiting_approval", "distributed"] as DiscussionStatus[])
            .map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          ניתן לבחור כל סטטוס, כולל חזרה אחורה. השינוי מתעדכן מיד.
        </p>
      </div>
    </div>
  );
}