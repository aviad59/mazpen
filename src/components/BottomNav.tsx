import * as React from "react";
import { LayoutDashboard, Plus, Search, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { T } from "@/lib/he";

export type Tab = "dashboard" | "search" | "archive";

interface Props {
  tab: Tab;
  onChange: (next: Tab) => void;
  onAdd: () => void;
}

export function BottomNav({ tab, onChange, onAdd }: Props) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 glass border-t border-border safe-bottom">
      <div className="mx-auto max-w-xl grid grid-cols-4 items-center">
        <TabButton
          active={tab === "dashboard"}
          onClick={() => onChange("dashboard")}
          icon={<LayoutDashboard size={20} />}
          label={T.tabs.dashboard}
        />
        <TabButton
          active={tab === "search"}
          onClick={() => onChange("search")}
          icon={<Search size={20} />}
          label={T.tabs.search}
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
