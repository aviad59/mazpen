import { Input, Textarea, Label } from "./ui/Input";
import { Select } from "./ui/Select";
import { ParticipantPicker } from "./ParticipantPicker";
import { DateWindowPicker } from "./DateWindowPicker";
import { useStore } from "@/store/useStore";
import { STATUS_LABEL, T } from "@/lib/he";
import type { DateWindow, Discussion, DiscussionStatus } from "@/types";

export interface EditState {
  name: string;
  notes: string;
  summary: string;
  dateWindow: DateWindow;
  participantIds: string[];
  leaderId: string;
}

interface Props {
  discussion: Discussion;
  state: EditState;
  onChange: (patch: Partial<EditState>) => void;
}

export function DiscussionEditForm({ discussion, state, onChange }: Props) {
  const { participants, addParticipant, changeStatus } = useStore();

  const leaderOptions = [
    { value: "", label: "ללא מוביל" },
    ...state.participantIds
      .map((id) => participants.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <div className="space-y-4">
      <div>
        <Label>שם הדיון</Label>
        <Input value={state.name} onChange={(e) => onChange({ name: e.target.value })} />
      </div>

      <div>
        <Label>{T.window}</Label>
        <DateWindowPicker
          value={state.dateWindow}
          onChange={(v) => onChange({ dateWindow: v })}
        />
      </div>

      <div>
        <Label>{T.participants}</Label>
        <ParticipantPicker
          participants={participants}
          value={state.participantIds}
          onChange={(ids) => onChange({ participantIds: ids })}
          onCreate={addParticipant}
        />
      </div>

      {state.participantIds.length > 0 && (
        <div>
          <Label>{T.leader}</Label>
          <Select
            value={state.leaderId}
            onChange={(e) => onChange({ leaderId: e.target.value })}
            options={leaderOptions}
          />
        </div>
      )}

      <div>
        <Label>{T.notes}</Label>
        <Textarea
          value={state.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={3}
        />
      </div>

      <div>
        <Label>{T.summary}</Label>
        <Textarea
          value={state.summary}
          onChange={(e) => onChange({ summary: e.target.value })}
          placeholder={T.writeSummary}
          rows={5}
        />
      </div>

      <div>
        <Label>סטטוס (לעריכה ישירה)</Label>
        <Select
          value={discussion.status}
          onChange={(e) =>
            changeStatus(discussion.id, e.target.value as DiscussionStatus)
          }
          options={(Object.keys(STATUS_LABEL) as DiscussionStatus[])
            .filter((s) => s !== "cancelled")
            .map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          ניתן לבחור כל סטטוס, כולל חזרה אחורה. השינוי מתעדכן מיד.
        </p>
      </div>
    </div>
  );
}
