import { Building2, CalendarRange, FileText, Paperclip } from "lucide-react";
import { Card } from "./ui/Card";
import { Avatar } from "./ui/Avatar";
import { Badge } from "./ui/Badge";
import { PriorityBadge, StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";
import type { Discussion, Participant } from "@/types";
import { HOME_UNIT, T, WINDOW_LABEL } from "@/lib/he";

interface Props {
  discussion: Discussion;
  lookupParticipant: (id: string) => Participant | undefined;
  onOpen: (id: string) => void;
  compact?: boolean;
}

function externalUnits(participants: Participant[]): string[] {
  const seen = new Set<string>();
  for (const p of participants) {
    if (p.unit && p.unit !== HOME_UNIT) seen.add(p.unit);
  }
  return Array.from(seen);
}

export function DiscussionCard({ discussion: d, lookupParticipant, onOpen, compact }: Props) {
  const thisWeek = d.dateWindow === "this_week";

  const leader = d.leaderId ? lookupParticipant(d.leaderId) : undefined;
  const participants = d.participantIds
    .map((id) => lookupParticipant(id))
    .filter((p): p is Participant => !!p);

  const ext = externalUnits(participants);

  return (
    <Card
      onClick={() => onOpen(d.id)}
      className={cn(
        "cursor-pointer transition-shadow hover:shadow-md active:scale-[0.99] active:shadow-sm",
        thisWeek && "ring-1 ring-accent/30",
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
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3
          className={cn(
            "font-semibold leading-snug text-balance text-foreground",
            compact ? "text-sm" : "text-[15px]"
          )}
        >
          {d.name}
        </h3>
      </div>

      {/* Date window row */}
      <div
        className={cn(
          "mt-2 flex items-center gap-1.5 text-sm font-medium",
          thisWeek ? "text-accent" : "text-foreground/70"
        )}
      >
        <CalendarRange size={14} />
        <span>{WINDOW_LABEL[d.dateWindow]}</span>
      </div>

      {/* External units callout */}
      {ext.length > 0 && (
        <div className="mt-1.5 flex items-start gap-1 text-xs text-warning">
          <Building2 size={12} className="mt-[2px] shrink-0" />
          <span className="leading-snug">
            <span className="font-medium">{T.hasExternals}:</span>{" "}
            <span className="truncate">{ext.join(" · ")}</span>
          </span>
        </div>
      )}

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
            <span className="text-[11px] text-muted-foreground">
              +{participants.length - 4}
            </span>
          )}
          {leader && (
            <Badge tone="muted" className="ms-auto">
              מוביל: {leader.name}
            </Badge>
          )}
        </div>
      )}

      {/* Footer */}
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
