import * as React from "react";
import { Sheet } from "./ui/Sheet";
import { Label } from "./ui/Input";
import { Select } from "./ui/Select";
import { Button } from "./ui/Button";
import { Avatar } from "./ui/Avatar";
import { Badge } from "./ui/Badge";
import type { DiscussionRequest, Participant } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  request: DiscussionRequest | null;
  participants: Participant[];
  lookupParticipant: (id: string) => Participant | undefined;
  onApprove: (req: DiscussionRequest, leaderId?: string) => Promise<void>;
}

export function ApprovalSheet({ open, onClose, request, participants, lookupParticipant, onApprove }: Props) {
  const [leaderId, setLeaderId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const resolvedParticipants = (request?.participantIds ?? [])
    .map((id) => lookupParticipant(id))
    .filter((p): p is Participant => !!p);

  const needsLeader = resolvedParticipants.length > 0;

  React.useEffect(() => {
    if (!open) return;
    setLeaderId(request?.participantIds[0] ?? "");
  }, [open, request]);

  const leaderOptions = [
    { value: "", label: "ללא מוביל" },
    ...resolvedParticipants.map((p) => ({ value: p.id, label: p.name })),
  ];

  const canApprove = !saving && (!needsLeader || !!leaderId);

  async function handleApprove() {
    if (!request || !canApprove) return;
    setSaving(true);
    try {
      await onApprove(request, leaderId || undefined);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!request) return null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="אישור בקשת דיון"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
            ביטול
          </Button>
          <Button type="button" onClick={handleApprove} disabled={!canApprove} className="flex-[2]">
            {saving ? "יוצר דיון..." : "אשר וצור דיון"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">שם הדיון</p>
          <p className="font-semibold">{request.title}</p>
        </div>

        {request.notes && (
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">הערות</p>
            <p className="text-sm whitespace-pre-wrap">{request.notes}</p>
          </div>
        )}

        {resolvedParticipants.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">משתתפים מוצעים</p>
            <div className="flex flex-wrap gap-1.5">
              {resolvedParticipants.map((p) => (
                <span key={p.id} className="flex items-center gap-1 text-xs bg-muted rounded-full px-2 py-1">
                  <Avatar name={p.name} size="xs" />
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {needsLeader && (
          <div>
            <Label>מוביל הדיון *</Label>
            <Select
              value={leaderId}
              onChange={(e) => setLeaderId(e.target.value)}
              options={leaderOptions}
            />
            {!leaderId && (
              <p className="text-xs text-muted-foreground mt-1">יש לבחור מוביל לפני האישור</p>
            )}
          </div>
        )}

        <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          הדיון ייווצר בסטטוס <Badge tone="muted" className="text-[10px]">חדש</Badge> וייכנס ללוח המבצעי.
        </div>
      </div>
    </Sheet>
  );
}
