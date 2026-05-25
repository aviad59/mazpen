import { Badge } from "./ui/Badge";
import type { DiscussionStatus } from "@/types";
import { STATUS_LABEL } from "@/lib/he";

const STATUS_TONE: Record<DiscussionStatus, Parameters<typeof Badge>[0]["tone"]> = {
  new: "info",
  coordinated: "accent",
  occurred: "muted",
  waiting_summary: "warning",
  waiting_approval: "warning",
  distributed: "success",
  cancelled: "muted",
};

export function StatusBadge({ status }: { status: DiscussionStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}
