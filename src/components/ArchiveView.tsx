import * as React from "react";
import { Archive } from "lucide-react";
import { EmptyState } from "./ui/EmptyState";
import { DiscussionCard } from "./DiscussionCard";
import { SectionHeader } from "./SectionHeader";
import { useStore } from "@/store/useStore";
import { byCreatedDesc } from "@/lib/utils";

interface Props {
  onOpenDiscussion: (id: string) => void;
}

export function ArchiveView({ onOpenDiscussion }: Props) {
  const { discussions, lookupParticipant } = useStore();

  const completed = React.useMemo(
    () =>
      discussions
        .filter((d) => d.status === "distributed" || d.status === "cancelled")
        .sort(byCreatedDesc),
    [discussions]
  );

  return (
    <div className="px-3 pb-24">
      <SectionHeader
        title="ארכיון"
        hint="דיונים שטופלו במלואם או בוטלו"
        count={completed.length}
      />
      {completed.length === 0 ? (
        <EmptyState
          icon={<Archive size={36} />}
          title="הארכיון ריק"
          hint="דיונים שיושלמו יופיעו כאן"
        />
      ) : (
        <div className="space-y-2">
          {completed.map((d) => (
            <DiscussionCard
              key={d.id}
              discussion={d}
              lookupParticipant={lookupParticipant}
              onOpen={onOpenDiscussion}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}
