import * as React from "react";
import { LayoutDashboard, Plus, Inbox, Archive, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { T } from "@/lib/he";

export type Tab = "dashboard" | "search" | "inbox" | "archive" | "tasks";

interface Props {
  tab: Tab;
  onChange: (next: Tab) => void;
  onAdd: () => void;
  inboxCount?: number;
}

export function BottomNav({ tab, onChange, onAdd, inboxCount = 0 }: Props) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 glass border-t border-border safe-bottom">
      <div className="mx-auto max-w-xl grid grid-cols-5 items-center">
        <TabButton
          active={tab === "dashboard"}
          onClick={() => onChange("dashboard")}
          icon={<LayoutDashboard size={20} />}
          label={T.tabs.dashboard}
        />
        <TabButton
          active={tab === "inbox"}
          onClick={() => onChange("inbox")}
          icon={
            <span className="relative">
              <Inbox size={20} />
              {inboxCount > 0 && (
                <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-accent text-accent-foreground text-[9px] font-bold flex items-center justify-center leading-none">
                  {inboxCount > 9 ? "9+" : inboxCount}
                </span>
              )}
            </span>
          }
          label={T.tabs.inbox}
        />
        {/* Center add button — visually prominent */}
        <div className="flex justify-center -mt-5">
          <button
            onClick={onAdd}
            className="h-14 w-14 rounded-full bg-accent text-accent-foreground shadow-lg hover:opacity-90 active:scale-95 transition-all no-tap-highlight flex items-center justify-center"
            aria-label={T.newDiscussion}
          >
            <Plus size={26} />
          </button>
        </div>
        <TabButton
          active={tab === "tasks"}
          onClick={() => onChange("tasks")}
          icon={<ClipboardList size={20} />}
          label={T.tabs.tasks}
        />
        <TabButton
          active={tab === "archive"}
          onClick={() => onChange("archive")}
          icon={<Archive size={20} />}
          label={T.tabs.archive}
        />
      </div>
    </nav>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 py-2.5 no-tap-highlight",
        active ? "text-accent" : "text-muted-foreground"
      )}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
