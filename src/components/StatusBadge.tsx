import { Badge } from "./ui/Badge";
import type { DiscussionStatus, Priority } from "@/types";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/he";

const STATUS_TONE: Record<DiscussionStatus, Parameters<typeof Badge>[0]["tone"]> = {
  requires_scheduling: "danger",
  scheduled: "info",
  occurred: "muted",
  waiting_summary: "warning",
  waiting_approval: "warning",
  waiting_distribution: "warning",
  completed: "success",
  cancelled: "muted",
};

export function StatusBadge({ status }: { status: DiscussionStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "normal") return null;
  return (
    <Badge tone={priority === "urgent" ? "danger" : "warning"}>
      {PRIORITY_LABEL[priority]}
    </Badge>
  );
}
