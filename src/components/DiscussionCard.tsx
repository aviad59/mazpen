import { Calendar, FileText, Paperclip, User, AlertCircle } from "lucide-react";
import { Card } from "./ui/Card";
import { Avatar } from "./ui/Avatar";
import { Badge } from "./ui/Badge";
import { PriorityBadge, StatusBadge } from "./StatusBadge";
import { cn, formatHebrewDate, isSoon } from "@/lib/utils";
import type { Discussion, Participant } from "@/types";
import { T } from "@/lib/he";

interface Props {
  discussion: Discussion;
  lookupParticipant: (id: string) => Participant | undefined;
  onOpen: (id: string) => void;
  /** When true, render compact (less spacing). */
  compact?: boolean;
}

export function DiscussionCard({ discussion: d, lookupParticipant, onOpen, compact }: Props) {
  const unscheduled = !d.scheduledAt;
  const urgent = d.priority === "urgent";
  const soon = isSoon(d.scheduledAt);

  const leader = d.leaderId ? lookupParticipant(d.leaderId) : undefined;
  const participants = d.participantIds
    .map((id) => lookupParticipant(id))
    .filter((p): p is Participant => !!p);

  return (
    <Card
      onClick={() => onOpen(d.id)}
      className={cn(
        "cursor-pointer transition-shadow hover:shadow-md active:scale-[0.99] active:shadow-sm",
        unscheduled && "ring-1 ring-destructive/30",
        urgent && "ring-1 ring-destructive/60",
        soon && "ring-1 ring-accent/40",
        compact ? "p-3" : "p-4"
      )}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(d.id);
        }
      }}
    >
      {/* Header: name + urgent strip */}
      <div className="flex items-start justify-between gap-2">
        <h3 className={cn("font-semibold leading-snug text-balance text-foreground", compact ? "text-sm" : "text-[15px]")}>
          {urgent && (
            <AlertCircle
              size={14}
              className="inline-block ml-1 -mt-0.5 text-destructive"
              aria-label="דחוף"
            />
          )}
          {d.name}
        </h3>
      </div>

      {/* Date row — visually dominant */}
      <div
        className={cn(
          "mt-2 flex items-center gap-1.5 text-sm",
          unscheduled
            ? "text-destructive font-medium"
            : soon
            ? "text-accent font-semibold"
            : "text-foreground/80 font-medium"
        )}
      >
        {unscheduled ? (
          <>
            <AlertCircle size={14} />
            <span>{T.notScheduled}</span>
          </>
        ) : (
          <>
            <Calendar size={14} />
            <span>{formatHebrewDate(d.scheduledAt)}</span>
          </>
        )}
      </div>

      {/* Meta row: requester */}
      <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
        <User size={12} />
        <span className="truncate">דרש: {d.requester}</span>
      </div>

      {/* Participants strip */}
      {participants.length > 0 && (
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <div className="flex -space-x-1.5 space-x-reverse">
            {participants.slice(0, 4).map((p) => (
              <Avatar
                key={p.id}
                name={p.name}
                size="xs"
                className="ring-2 ring-card"
              />
            ))}
          </div>
          {participants.length > 4 && (
            <span className="text-[11px] text-muted-foreground">+{participants.length - 4}</span>
          )}
          {leader && (
            <Badge tone="muted" className="ms-auto">
              מוביל: {leader.name}
            </Badge>
          )}
        </div>
      )}

      {/* Footer: status + indicators */}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        <StatusBadge status={d.status} />
        <PriorityBadge priority={d.priority} />
        {d.attachments.length > 0 && (
          <Badge tone="muted">
            <Paperclip size={10} />
            {d.attachments.length}
          </Badge>
        )}
        {d.summary && (
          <Badge tone="accent">
            <FileText size={10} />
            סיכום
          </Badge>
        )}
      </div>
    </Card>
  );
}
