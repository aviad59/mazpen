import { Building2, CalendarRange, FileStack } from "lucide-react";
import { DrivingTimeIcon } from "./ui/DrivingTimeIcon";
import { Card } from "./ui/Card";
import { Avatar } from "./ui/Avatar";
import { Badge } from "./ui/Badge";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";
import type { Discussion, Participant } from "@/types";
import { HOME_UNIT, RECURRENCE_LABEL, T, WINDOW_LABEL } from "@/lib/he";

interface Props {
  discussion: Discussion;
  lookupParticipant: (id: string) => Participant | undefined;
  onOpen: (id: string) => void;
  compact?: boolean;
  isNew?: boolean;
  hideWindow?: boolean;
}

function externalUnits(participants: Participant[]): string[] {
  const seen = new Set<string>();
  for (const p of participants) {
    if (p.unit && p.unit !== HOME_UNIT) seen.add(p.unit);
  }
  return Array.from(seen);
}

export function DiscussionCard({ discussion: d, lookupParticipant, onOpen, compact, isNew, hideWindow }: Props) {
  const thisWeek = d.dateWindow === "this_week";

  const leaderLookup = d.leaderId ? lookupParticipant(d.leaderId) : undefined;
  const leaderName = d.leaderId ? (leaderLookup?.name ?? d.leaderId) : undefined;
  const participants = d.participantIds
    .map((id) => lookupParticipant(id))
    .filter((p): p is Participant => !!p);

  const ext = externalUnits(participants);

  return (
    <Card
      onClick={() => onOpen(d.id)}
      className={cn(
        "relative cursor-pointer transition-shadow hover:shadow-md active:scale-[0.99] active:shadow-sm",
        thisWeek && "ring-1 ring-accent/30",
        isNew && "ring-1 ring-red-400/60 bg-red-50/40 dark:bg-red-950/20",
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
      {/* Yellow dot for "new" status */}
      {d.status === "new" && (
        <span
          className="absolute top-2 left-2 w-2.5 h-2.5 rounded-full bg-yellow-400"
          title={"חדש — טרם תואם"}
        />
      )}
      {/* Orange dot for substrate — offset right if yellow dot also showing */}
      {d.requiresSubstrate && (
        <span
          className={cn(
            "absolute top-2 w-2.5 h-2.5 rounded-full bg-orange-400",
            d.status === "new" ? "left-6" : "left-2"
          )}
          title={"דורש מצע"}
        />
      )}

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
      {!hideWindow && (
        <div
          className={cn(
            "mt-2 flex items-center gap-1.5 text-sm font-medium",
            thisWeek ? "text-accent" : "text-foreground/70"
          )}
        >
          <CalendarRange size={14} />
          <span>{WINDOW_LABEL[d.dateWindow]}</span>
        </div>
      )}

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
      {(participants.length > 0 || (d.extraParticipants?.length ?? 0) > 0) && (
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
            {d.extraParticipants?.slice(0, Math.max(0, 4 - participants.length)).map((name, i) => (
              <Avatar
                key={`x${i}`}
                name={name}
                size="xs"
                className="ring-2 ring-card opacity-70"
              />
            ))}
          </div>
          {(participants.length + (d.extraParticipants?.length ?? 0)) > 4 && (
            <span className="text-[11px] text-muted-foreground">
              +{participants.length + (d.extraParticipants?.length ?? 0) - 4}
            </span>
          )}
          {leaderName && (
            <Badge tone="muted" className="ms-auto">
              {"מוביל: "}{leaderName}
            </Badge>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        <StatusBadge status={d.status} />
        {d.requiresSubstrate && (
          <Badge tone="muted">
            <FileStack size={10} />
            {"מצע"}
          </Badge>
        )}
        {d.recurrence !== "none" && (
          <Badge tone="accent">{RECURRENCE_LABEL[d.recurrence]}</Badge>
        )}
        {d.recurrence !== "none" && (d.cycles?.length ?? 0) > 0 && (
          <Badge tone="muted">מחזור {(d.cycles?.length ?? 0) + 1}</Badge>
        )}
        {d.drivingTimePreference && (
          <Badge tone="muted" className="gap-1 px-1.5">
            <DrivingTimeIcon size={16} />
          </Badge>
        )}
        {d.requiresBashiReview && (
          <Badge tone="warning">דורש מעבר של בשי</Badge>
        )}
      </div>
    </Card>
  );
}
