import * as React from "react";
import { Inbox, Link, Check, X, Clock, CheckCircle2, XCircle, Loader2, Pencil } from "lucide-react";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Avatar } from "./ui/Avatar";
import { EmptyState } from "./ui/EmptyState";
import { Sheet } from "./ui/Sheet";
import { Input, Textarea, Label } from "./ui/Input";
import { ParticipantPicker } from "./ParticipantPicker";
import { ApprovalSheet } from "./ApprovalSheet";
import { cn } from "@/lib/utils";
import { useRequestStore, approveRequest, rejectRequest, removeRequest, updateRequest, submitDiscussionRequest } from "@/store/useRequestStore";
import { useStore } from "@/store/useStore";
import type { DiscussionRequest, Participant } from "@/types";

const REQUEST_FORM_PATH = "/request";

function requestFormUrl(): string {
  return window.location.origin + REQUEST_FORM_PATH;
}

function StatusIcon({ status }: { status: DiscussionRequest["status"] }) {
  if (status === "approved") return <CheckCircle2 size={14} className="text-green-500" />;
  if (status === "rejected") return <XCircle size={14} className="text-destructive" />;
  return <Clock size={14} className="text-amber-500" />;
}

function StatusBadgeInbox({ status }: { status: DiscussionRequest["status"] }) {
  if (status === "approved") return <Badge tone="accent">אושר</Badge>;
  if (status === "rejected") return <Badge tone="muted" className="text-destructive">נדחה</Badge>;
  return <Badge tone="warning">ממתין</Badge>;
}

// ---- Edit sheet -----------------------------------------------------------

interface EditSheetProps {
  open: boolean;
  onClose: () => void;
  request: DiscussionRequest | null;
  participants: Participant[];
  onCreate: (input: { name: string; role?: string; unit?: string }) => Promise<Participant>;
  onSave: (id: string, patch: Partial<Pick<DiscussionRequest, "title" | "requesterName" | "notes" | "participantIds" | "durationMinutes">>) => Promise<void>;
}

function EditSheet({ open, onClose, request, participants, onCreate, onSave }: EditSheetProps) {
  const [title, setTitle] = React.useState("");
  const [requesterName, setRequesterName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [durationMinutes, setDurationMinutes] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open || !request) return;
    setTitle(request.title);
    setRequesterName(request.requesterName);
    setNotes(request.notes ?? "");
    setDurationMinutes(request.durationMinutes?.toString() ?? "");
    setSelectedIds(request.participantIds);
  }, [open, request]);

  const canSave = title.trim().length > 0 && requesterName.trim().length > 0 && !saving;

  async function handleSave() {
    if (!request || !canSave) return;
    setSaving(true);
    const parsedDuration = durationMinutes.trim() ? parseInt(durationMinutes, 10) : undefined;
    try {
      await onSave(request.id, {
        title: title.trim(),
        requesterName: requesterName.trim(),
        notes: notes.trim() || undefined,
        participantIds: selectedIds,
        durationMinutes: parsedDuration && !isNaN(parsedDuration) ? parsedDuration : undefined,
      });
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
      title="עריכת בקשה"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">ביטול</Button>
          <Button type="button" onClick={handleSave} disabled={!canSave} className="flex-[2]">
            {saving ? "שומר..." : "שמור"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="edit-title">שם הדיון *</Label>
          <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div>
          <Label htmlFor="edit-requester">שם מבקש *</Label>
          <Input id="edit-requester" value={requesterName} onChange={(e) => setRequesterName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="edit-notes">הערות</Label>
          <Textarea id="edit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
        <div>
          <Label htmlFor="edit-duration">משך הדיון (דקות)</Label>
          <Input
            id="edit-duration"
            type="number"
            min={1}
            max={480}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            placeholder="לדוגמה: 60"
          />
        </div>
        <div>
          <Label>משתתפים</Label>
          <ParticipantPicker
            participants={participants}
            value={selectedIds}
            onChange={setSelectedIds}
            onCreate={onCreate}
          />
        </div>
      </div>
    </Sheet>
  );
}

// ---- Add request sheet ----------------------------------------------------

interface AddRequestSheetProps {
  open: boolean;
  onClose: () => void;
  participants: Participant[];
  onCreate: (input: { name: string; role?: string; unit?: string }) => Promise<Participant>;
}

function AddRequestSheet({ open, onClose, participants, onCreate }: AddRequestSheetProps) {
  const [title, setTitle] = React.useState("");
  const [requesterName, setRequesterName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [durationMinutes, setDurationMinutes] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setRequesterName("");
    setNotes("");
    setDurationMinutes("");
    setSelectedIds([]);
  }, [open]);

  const canSave = title.trim().length > 0 && requesterName.trim().length > 0 && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const parsedDuration = durationMinutes.trim() ? parseInt(durationMinutes, 10) : undefined;
    try {
      await submitDiscussionRequest({
        title: title.trim(),
        requesterName: requesterName.trim(),
        notes: notes.trim() || undefined,
        participantIds: selectedIds,
        durationMinutes: parsedDuration && !isNaN(parsedDuration) ? parsedDuration : undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="הוספת בקשה"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">ביטול</Button>
          <Button type="button" onClick={handleSave} disabled={!canSave} className="flex-[2]">
            {saving ? "שומר..." : "הוסף בקשה"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="add-req-title">שם הדיון *</Label>
          <Input id="add-req-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="לדוגמה: דיון מבצעי שבועי" />
        </div>
        <div>
          <Label htmlFor="add-req-name">שם מבקש *</Label>
          <Input id="add-req-name" value={requesterName} onChange={(e) => setRequesterName(e.target.value)} placeholder="שם מלא" />
        </div>
        <div>
          <Label htmlFor="add-req-duration">משך הדיון (דקות)</Label>
          <Input
            id="add-req-duration"
            type="number"
            min={1}
            max={480}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            placeholder="לדוגמה: 60"
          />
        </div>
        <div>
          <Label htmlFor="add-req-notes">הערות</Label>
          <Textarea id="add-req-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
        <div>
          <Label>משתתפים מוצעים</Label>
          <ParticipantPicker
            participants={participants}
            value={selectedIds}
            onChange={setSelectedIds}
            onCreate={onCreate}
          />
        </div>
      </div>
    </Sheet>
  );
}

// ---- Request card ---------------------------------------------------------

interface RequestCardProps {
  req: DiscussionRequest;
  lookupParticipant: (id: string) => Participant | undefined;
  onApprove: (req: DiscussionRequest) => void;
  onEdit: (req: DiscussionRequest) => void;
  onReject: (id: string) => void;
  onDelete: (id: string) => void;
}

function RequestCard({ req, lookupParticipant, onApprove, onEdit, onReject, onDelete }: RequestCardProps) {
  const resolvedParticipants = req.participantIds
    .map((id) => lookupParticipant(id))
    .filter((p): p is Participant => !!p);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <StatusIcon status={req.status} />
            <h3 className="font-semibold text-[15px] leading-snug truncate">{req.title}</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            בקשה מאת <span className="font-medium text-foreground">{req.requesterName}</span>
            {" · "}
            {new Date(req.createdAt).toLocaleDateString("he-IL")}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusBadgeInbox status={req.status} />
          <button
            type="button"
            onClick={() => onEdit(req)}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
            title="עריכה"
          >
            <Pencil size={13} />
          </button>
        </div>
      </div>

      {req.durationMinutes && (
        <p className="text-xs text-muted-foreground">
          משך מבוקש:{" "}
          <span className="font-medium text-foreground">{req.durationMinutes} דקות</span>
        </p>
      )}

      {req.notes && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{req.notes}</p>
      )}

      {resolvedParticipants.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {resolvedParticipants.map((p) => (
            <span key={p.id} className="flex items-center gap-1 text-xs bg-muted rounded-full px-2 py-1">
              <Avatar name={p.name} size="xs" />
              {p.name}
            </span>
          ))}
        </div>
      )}

      {req.status === "pending" && (
        <div className="flex gap-2 pt-1">
          <Button type="button" size="sm" onClick={() => onApprove(req)} className="flex-1 gap-1.5">
            <Check size={14} />
            אשר
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onReject(req.id)}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            <X size={14} />
            דחה
          </Button>
        </div>
      )}

      {req.status !== "pending" && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onDelete(req.id)}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            הסר
          </button>
        </div>
      )}
    </Card>
  );
}

// ---- Main view ------------------------------------------------------------

interface InboxViewProps {
  addOpen?: boolean;
  onAddClose?: () => void;
}

export function InboxView({ addOpen = false, onAddClose }: InboxViewProps) {
  const { requests, loading } = useRequestStore();
  const { participants, lookupParticipant, createDiscussion, addParticipant } = useStore();
  const [copied, setCopied] = React.useState(false);
  const [approvalReq, setApprovalReq] = React.useState<DiscussionRequest | null>(null);
  const [editReq, setEditReq] = React.useState<DiscussionRequest | null>(null);
  const [filter, setFilter] = React.useState<"pending" | "all">("pending");

  const displayed = filter === "pending" ? requests.filter((r) => r.status === "pending") : requests;
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  function copyLink() {
    navigator.clipboard.writeText(requestFormUrl()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleApprove(req: DiscussionRequest, leaderId?: string) {
    await createDiscussion({
      name: req.title,
      participantIds: req.participantIds,
      leaderId,
      notes: req.notes,
      durationMinutes: req.durationMinutes,
    });
    await approveRequest(req.id);
  }

  async function handleEdit(id: string, patch: Partial<Pick<DiscussionRequest, "title" | "requesterName" | "notes" | "participantIds">>) {
    await updateRequest(id, patch);
  }

  return (
    <div className="max-w-xl w-full mx-auto px-3 pb-24 pt-3 space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <Inbox size={18} className="text-accent" />
            בקשות דיון
            {pendingCount > 0 && (
              <span className="text-xs font-semibold bg-accent text-accent-foreground rounded-full px-2 py-0.5">
                {pendingCount}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">בקשות שהוגשו דרך טופס ציבורי</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={copyLink}
          className={cn("gap-1.5 shrink-0", copied && "text-green-600")}
        >
          <Link size={14} />
          {copied ? "הועתק!" : "העתק קישור לטופס"}
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        <button
          type="button"
          onClick={() => setFilter("pending")}
          className={cn(
            "flex-1 text-sm font-medium py-1.5 rounded-md transition-colors",
            filter === "pending" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          )}
        >
          ממתינות ({pendingCount})
        </button>
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn(
            "flex-1 text-sm font-medium py-1.5 rounded-md transition-colors",
            filter === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          )}
        >
          הכל ({requests.length})
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">טוען בקשות...</span>
        </div>
      ) : displayed.length === 0 ? (
        <EmptyState
          icon={<Inbox size={40} />}
          title={filter === "pending" ? "אין בקשות ממתינות" : "אין בקשות"}
          hint={
            filter === "pending"
              ? "כשמישהו ישלח בקשה דרך הטופס, היא תופיע כאן."
              : "עדיין לא הוגשו בקשות."
          }
        />
      ) : (
        <div className="space-y-3">
          {displayed.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              lookupParticipant={lookupParticipant}
              onApprove={setApprovalReq}
              onEdit={setEditReq}
              onReject={rejectRequest}
              onDelete={removeRequest}
            />
          ))}
        </div>
      )}

      <ApprovalSheet
        open={!!approvalReq}
        onClose={() => setApprovalReq(null)}
        request={approvalReq}
        participants={participants}
        lookupParticipant={lookupParticipant}
        onApprove={handleApprove}
      />

      <EditSheet
        open={!!editReq}
        onClose={() => setEditReq(null)}
        request={editReq}
        participants={participants}
        onCreate={addParticipant}
        onSave={handleEdit}
      />

      <AddRequestSheet
        open={addOpen}
        onClose={() => onAddClose?.()}
        participants={participants}
        onCreate={addParticipant}
      />
    </div>
  );
}
