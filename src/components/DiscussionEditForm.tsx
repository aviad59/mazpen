import * as React from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { Input, Textarea, Label } from "./ui/Input";
import { Select } from "./ui/Select";
import { Switch } from "./ui/Switch";
import { Button } from "./ui/Button";
import { Chip } from "./ui/Chip";
import { DrivingTimeIcon } from "./ui/DrivingTimeIcon";
import { ParticipantPicker } from "./ParticipantPicker";
import { DateWindowPicker } from "./DateWindowPicker";
import { useStore } from "@/store/useStore";
import { RECURRENCE_LABEL, STATUS_LABEL, T, isPEDiscussion } from "@/lib/he";
import type { DateWindow, Discussion, DiscussionStatus, Recurrence } from "@/types";

export interface EditState {
  name: string;
  notes: string;
  dateWindow: DateWindow;
  participantIds: string[];
  extraParticipants: string[];
  leaderId: string;
  requiresSummary: boolean;
  requiresSubstrate: boolean;
  recurrence: Recurrence;
  durationMinutes?: number;
  drivingTimePreference: boolean;
  requiresBashiReview: boolean;
}

interface Props {
  discussion: Discussion;
  state: EditState;
  onChange: (patch: Partial<EditState>) => void;
  isBashiUser?: boolean;
}

export function DiscussionEditForm({ discussion, state, onChange, isBashiUser }: Props) {
  const { participants, groups, addParticipant, changeStatus } = useStore();
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [tempName, setTempName] = React.useState("");

  const isPE = isPEDiscussion(state.name);

  // Auto-select leader when participants change (skip when PE)
  React.useEffect(() => {
    if (isPE || state.participantIds.length === 0) return;
    const eligibleIds = state.participantIds.filter(
      (id) => !participants.find((p) => p.id === id)?.optional
    );
    if (!state.leaderId || !eligibleIds.includes(state.leaderId)) {
      onChange({ leaderId: eligibleIds[0] ?? state.participantIds[0] });
    }
  }, [state.participantIds, state.leaderId, onChange]);

  // Derive effective values — PE overrides at render time, no async effects needed
  const effectiveLeaderId = isPE ? "" : (state.leaderId ?? "");
  const effectiveRequiresSummary = isPE ? false : state.requiresSummary;
  const effectiveRequiresSubstrate = isPE ? false : state.requiresSubstrate;

  const leaderOptions = state.participantIds
    .map((id) => participants.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p && !p.optional)
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
          nameHint={state.name}
        />
        {state.participantIds.length === 0 && (
          <p className="text-[11px] text-destructive mt-1">דיון חייב לכלול לפחות משתתף אחד.</p>
        )}
      </div>

      {/* Extra (temporary) participants */}
      <div>
        <Label>משתתפים זמניים</Label>
        <p className="text-[11px] text-muted-foreground mb-1.5">שמות שלא נשמרים ברשימת המשתתפים</p>
        <div className="flex gap-2">
          <Input
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            placeholder="שם המשתתף..."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const n = tempName.trim();
                if (n) { onChange({ extraParticipants: [...state.extraParticipants, n] }); setTempName(""); }
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!tempName.trim()}
            onClick={() => {
              const n = tempName.trim();
              if (n) { onChange({ extraParticipants: [...state.extraParticipants, n] }); setTempName(""); }
            }}
          >
            <Plus size={14} />
          </Button>
        </div>
        {state.extraParticipants.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {state.extraParticipants.map((name, i) => (
              <Chip
                key={i}
                size="sm"
                active
                onRemove={() => onChange({ extraParticipants: state.extraParticipants.filter((_, j) => j !== i) })}
              >
                {name}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {state.participantIds.length > 0 && (
        <div>
          <Label>{T.leader}{!isPE && " *"}</Label>
          {isPE ? (
            <div className="h-11 w-full rounded-lg border border-input bg-muted/40 px-3 flex items-center text-sm text-muted-foreground cursor-not-allowed">
              זיהינו שמדובר בפ&quot;ע/פ&quot;א — אין צורך במוביל
            </div>
          ) : (
            <Select
              value={effectiveLeaderId}
              onChange={(e) => onChange({ leaderId: e.target.value })}
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
        {isPE ? (
          <p className="text-sm text-muted-foreground">
            זיהינו שמדובר בפ&quot;ע/פ&quot;א — אין צורך בסיכום או מצע
          </p>
        ) : (
          <>
            <Switch checked={effectiveRequiresSummary} onChange={(v) => onChange({ requiresSummary: v })} label={T.requiresSummary} />
            <Switch checked={effectiveRequiresSubstrate} onChange={(v) => onChange({ requiresSubstrate: v })} label={T.requiresSubstrate} />
          </>
        )}
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

      {/* Advanced settings */}
      <div className="rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors select-none"
        >
          הגדרות מתקדמות
          <ChevronDown size={15} className={advancedOpen ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>
        {advancedOpen && (
          <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
            <Switch
              checked={state.drivingTimePreference}
              onChange={(v) => onChange({ drivingTimePreference: v })}
              label={
                <span className="flex items-center gap-1.5">
                  עדיפות לזמן נהיגה
                  <DrivingTimeIcon size={18} className="text-muted-foreground" />
                </span>
              }
            />
            <Switch
              checked={isBashiUser ? false : state.requiresBashiReview}
              onChange={(v) => onChange({ requiresBashiReview: v })}
              disabled={isBashiUser}
              label={
                <span>
                  דורש מעבר של בשי
                  {isBashiUser && (
                    <span className="text-xs text-muted-foreground mr-1">(יתאפס בשמירה)</span>
                  )}
                </span>
              }
            />
          </div>
        )}
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