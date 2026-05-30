import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  hint?: string;
  count?: number;
  variant?: "default" | "alert" | "muted";
  className?: string;
  /** Right-side optional content (e.g. "show more" link). */
  trailing?: React.ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function SectionHeader({
  title,
  hint,
  count,
  variant = "default",
  className,
  trailing,
  collapsed,
  onToggle,
}: Props) {
  const isCollapsible = typeof onToggle === "function";

  return (
    <div
      role={isCollapsible ? "button" : undefined}
      onClick={onToggle}
      className={cn(
        "flex items-start justify-between gap-3 px-1 pt-4 pb-2",
        isCollapsible && "cursor-pointer select-none",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2
            className={cn(
              "text-[15px] font-semibold tracking-tight",
              variant === "alert" && "text-destructive",
              variant === "muted" && "text-muted-foreground"
            )}
          >
            {title}
          </h2>
          {typeof count === "number" && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                variant === "alert"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {count}
            </span>
          )}
        </div>
        {hint && (
          <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
        )}
      </div>
      {trailing}
      {isCollapsible && (
        <ChevronDown
          size={16}
          className={cn(
            "mt-1 shrink-0 text-muted-foreground transition-transform duration-200",
            collapsed && "-rotate-90"
          )}
        />
      )}
    </div>
  );
}
