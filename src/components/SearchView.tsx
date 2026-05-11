import * as React from "react";
import { Search as SearchIcon, X, Filter } from "lucide-react";
import { Input } from "./ui/Input";
import { Chip } from "./ui/Chip";
import { EmptyState } from "./ui/EmptyState";
import { Button } from "./ui/Button";
import { DiscussionCard } from "./DiscussionCard";
import { useStore } from "@/store/useStore";
import { STATUS_LABEL, T } from "@/lib/he";
import { byDateAsc } from "@/lib/utils";
import type { Discussion, DiscussionStatus } from "@/types";

type Quick =
  | "all"
  | "unscheduled"
  | "waiting_summary"
  | "waiting_approval"
  | "waiting_distribution"
  | "completed";

const QUICK_LABEL: Record<Quick, string> = {
  all: "הכל",
  unscheduled: "ללא תאריך",
  waiting_summary: STATUS_LABEL.waiting_summary,
  waiting_approval: STATUS_LABEL.waiting_approval,
  waiting_distribution: STATUS_LABEL.waiting_distribution,
  completed: STATUS_LABEL.completed,
};

interface Props {
  onOpenDiscussion: (id: string) => void;
}

export function SearchView({ onOpenDiscussion }: Props) {
  const { discussions, lookupParticipant, participants } = useStore();
  const [query, setQuery] = React.useState("");
  const [quick, setQuick] = React.useState<Quick>("all");
  const [participantId, setParticipantId] = React.useState<string>("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return discussions
      .filter((d) => {
        if (d.status === "cancelled") return false;

        if (quick === "unscheduled") {
          if (d.scheduledAt) return false;
        } else if (quick !== "all") {
          if (d.status !== (quick as DiscussionStatus)) return false;
        }

        if (participantId) {
          if (!d.participantIds.includes(participantId) && d.leaderId !== participantId)
            return false;
        }

        if (!q) return true;
        const haystack = [
          d.name,
          d.requester,
          d.notes ?? "",
          d.summary ?? "",
          ...d.participantIds
            .map((id) => lookupParticipant(id)?.name ?? "")
            .filter(Boolean),
          d.leaderId ? lookupParticipant(d.leaderId)?.name ?? "" : "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort(byDateAsc);
  }, [discussions, query, quick, participantId, lookupParticipant]);

  return (
    <div className="space-y-3 pt-3 pb-24">
      {/* Search bar */}
      <div className="relative px-3">
        <SearchIcon
          size={16}
          className="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={T.search}
          className="pr-10"
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute left-6 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
            aria-label="נקה"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Quick filters */}
      <div className="px-3 -mx-1 overflow-x-auto scrollbar-thin">
        <div className="flex gap-2 px-1 pb-1 whitespace-nowrap">
          {(Object.keys(QUICK_LABEL) as Quick[]).map((q) => (
            <Chip
              key={q}
              size="sm"
              active={quick === q}
              onClick={() => setQuick(q)}
            >
              {QUICK_LABEL[q]}
            </Chip>
          ))}
        </div>
      </div>

      {/* Participant filter */}
      <div className="px-3 -mx-1 overflow-x-auto scrollbar-thin">
        <div className="flex items-center gap-2 px-1 pb-1 whitespace-nowrap">
          <Filter size={12} className="text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">משתתף:</span>
          <Chip
            size="sm"
            active={participantId === ""}
            onClick={() => setParticipantId("")}
          >
            כולם
          </Chip>
          {participants.slice(0, 10).map((p) => (
            <Chip
              key={p.id}
              size="sm"
              active={participantId === p.id}
              onClick={() => setParticipantId(p.id === participantId ? "" : p.id)}
            >
              {p.name}
            </Chip>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="px-3 space-y-2">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<SearchIcon size={32} />}
            title={T.noResults}
            hint={T.noResultsHint}
            action={
              query || quick !== "all" || participantId ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setQuick("all");
                    setParticipantId("");
                  }}
                >
                  נקה סינון
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <p className="text-xs text-muted-foreground px-1">
              {filtered.length} תוצאות
            </p>
            {filtered.map((d: Discussion) => (
              <DiscussionCard
                key={d.id}
                discussion={d}
                lookupParticipant={lookupParticipant}
                onOpen={onOpenDiscussion}
                compact
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
