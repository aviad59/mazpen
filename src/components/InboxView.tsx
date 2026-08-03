import * as React from "react";
import { Inbox, Link, Check, X, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Avatar } from "./ui/Avatar";
import { EmptyState } from "./ui/EmptyState";
import { ApprovalSheet } from "./ApprovalSheet";
import { cn } from "@/lib/utils";
import { useRequestStore, approveRequest, rejectRequest, removeRequest } from "@/store/useRequestStore";
import { useStore } from "@/store/useStore";
import type { DiscussionRequest } from "@/types";

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

interface RequestCardProps {
  req: DiscussionRequest;
  lookupParticipant: (id: string) => import("@/types").Participant | undefined;
  onApprove: (req: DiscussionRequest) => void;
  onReject: (id: string) => void;
  onDelete: (id: string) => void;
}

function RequestCard({ req, lookupParticipant, onApprove, onReject, onDelete }: RequestCardProps) {
  const participants = req.participantIds
    .map((id) => lookupParticipant(id))
    .filter(Boolean);

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
        <StatusBadgeInbox status={req.status} />
      </div>

      {req.notes && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{req.notes}</p>
      )}

      {participants.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {participants.map((p) => p && (
            <span key={p.id} className="flex items-center gap-1 text-xs bg-muted rounded-full px-2 py-1">
              <Avatar name={p.name} size="xs" />
              {p.name}
            </span>
          ))}
        </div>
      )}

      {req.status === "pending" && (
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            onClick={() => onApprove(req)}
            className="flex-1 gap-1.5"
          >
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

export function InboxView() {
  const { requests, loading } = useRequestStore();
  const { participants, lookupParticipant, createDiscussion } = useStore();
  const [copied, setCopied] = React.useState(false);
  const [approvalReq, setApprovalReq] = React.useState<DiscussionRequest | null>(null);
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
    });
    await approveRequest(req.id);
  }

  async function handleReject(id: string) {
    await rejectRequest(id);
  }

  async function handleDelete(id: string) {
    await removeRequest(id);
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
          <p className="text-xs text-muted-foreground mt-0.5">
            בקשות שהוגשו דרך טופס ציבורי
          </p>
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
              onReject={handleReject}
              onDelete={handleDelete}
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
    </div>
  );
}
