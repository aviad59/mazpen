import { Badge } from "./ui/Badge";
import type { DiscussionStatus } from "@/types";
import { STATUS_LABEL } from "@/lib/he";

const STATUS_TONE: Record<DiscussionStatus, Parameters<typeof Badge>[0]["tone"]> = {
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
