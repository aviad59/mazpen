import * as React from "react";
import { Search as SearchIcon, X, Filter } from "lucide-react";
import { Input } from "./ui/Input";
import { Chip } from "./ui/Chip";
import { EmptyState } from "./ui/EmptyState";
import { Button } from "./ui/Button";
import { DiscussionCard } from "./DiscussionCard";
import { useStore } from "@/store/useStore";
import { STATUS_LABEL, T, WINDOW_LABEL } from "@/lib/he";
import type { DateWindow, Discussion, DiscussionStatus } from "@/types";

type Quick =
  | "all"
  | DateWindow
  | DiscussionStatus;

const QUICK_OPTIONS: { key: Quick; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "this_week", label: WINDOW_LABEL.this_week },
  { key: "next_week", label: WINDOW_LABEL.next_week },
  { key: "later", label: WINDOW_LABEL.later },
  { key: "in_a_month", label: WINDOW_LABEL.in_a_month },
  { key: "unspecified", label: WINDOW_LABEL.unspecified },
  { key: "new", label: STATUS_LABEL.new },
  { key: "coordinated", label: STATUS_LABEL.coordinated },
  { key: "waiting_summary", label: STATUS_LABEL.waiting_summary },
  { key: "waiting_approval", label: STATUS_LABEL.waiting_approval },
  { key: "distributed", label: STATUS_LABEL.distributed },
];

const WINDOW_KEYS = new Set<Quick>(["this_week", "next_week", "later", "in_a_month", "unspecified"]);
const STATUS_KEYS = new Set<Quick>([
  "new",
  "coordinated",
  "waiting_summary",
  "waiting_approval",
  "distributed",
]);

interface Props {
  onOpenDiscussion: (id: string) => void;
}

export function SearchView({ onOpenDiscussion }: Props) {
  const { discussions, lookupParticipant, participants, isNewDiscussion } = useStore();
  const [query, setQuery] = React.useState("");
  const [quick, setQuick] = React.useState<Quick>("all");
  const [participantId, setParticipantId] = React.useState<string>("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return discussions.filter((d) => {
      if (d.status === "cancelled") return false;

      if (WINDOW_KEYS.has(quick)) {
        if ((d.status !== "new" && d.status !== "coordinated") || d.dateWindow !== (quick as DateWindow))
          return false;
      } else if (STATUS_KEYS.has(quick)) {
        if (d.status !== (quick as DiscussionStatus)) return false;
      }

      if (participantId) {
        if (
          !d.participantIds.includes(participantId) &&
          d.leaderId !== participantId
        )
          return false;
      }

      if (!q) return true;

      const participantStrings = d.participantIds.flatMap((id) => {
        const p = lookupParticipant(id);
        if (!p) return [];
        return [p.name, p.role ?? "", p.unit ?? ""];
      });
      const haystack = [
        d.name,
        d.notes ?? "",
        d.summary ?? "",
        ...participantStrings,
        d.leaderId ? lookupParticipant(d.leaderId)?.name ?? "" : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [discussions, query, quick, participantId, lookupParticipant]);

  return (
    <div className="space-y-3 pt-3 pb-24">
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

      <div className="px-3 -mx-1 overflow-x-auto scrollbar-thin">
        <div className="flex gap-2 px-1 pb-1 whitespace-nowrap">
          {QUICK_OPTIONS.map((o) => (
            <Chip
              key={o.key}
              size="sm"
              active={quick === o.key}
              onClick={() => setQuick(o.key)}
            >
              {o.label}
            </Chip>
          ))}
        </div>
      </div>

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
              onClick={() =>
                setParticipantId(p.id === participantId ? "" : p.id)
              }
            >
              {p.name}
            </Chip>
          ))}
        </div>
      </div>

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
                isNew={isNewDiscussion(d.id)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
