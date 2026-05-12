import * as React from "react";
import { Input, Textarea, Label } from "./ui/Input";
import { Chip } from "./ui/Chip";
import { Select } from "./ui/Select";
import { ParticipantPicker } from "./ParticipantPicker";
import { DateQuickPicker } from "./DateQuickPicker";
import { useStore } from "@/store/useStore";
import { PRIORITY_LABEL, STATUS_LABEL, T } from "@/lib/he";
import type { Discussion, DiscussionStatus, Priority } from "@/types";

export interface EditState {
  name: string;
  requester: string;
  notes: string;
  summary: string;
  scheduledAt: string | null;
  participantIds: string[];
  leaderId: string;
  priority: Priority;
}

interface Props {
  discussion: Discussion;
  state: EditState;
  onChange: (patch: Partial<EditState>) => void;
}

/**
 * Edit-mode form for the DiscussionDetail. Controlled by the parent —
 * `state` holds the in-progress edits; `onChange` merges patches.
 */
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
        <Label>{T.requester}</Label>
        <Input
          value={state.requester}
          onChange={(e) => onChange({ requester: e.target.value })}
        />
      </div>

      <div>
        <Label>מועד</Label>
        <DateQuickPicker
          value={state.scheduledAt}
          onChange={(v) => onChange({ scheduledAt: v })}
        />
      </div>

      <div>
        <Label>{T.priority}</Label>
        <div className="flex gap-2">
          {(["normal", "high", "urgent"] as Priority[]).map((p) => (
            <Chip
              key={p}
              active={state.priority === p}
              onClick={() => onChange({ priority: p })}
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
