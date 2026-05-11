import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md";
}

export function Chip({
  active,
  onClick,
  onRemove,
  children,
  className,
  size = "md",
}: ChipProps) {
  return (
    <span
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border transition-colors no-tap-highlight",
        size === "sm"
          ? "px-2.5 py-1 text-xs"
          : "px-3 py-1.5 text-sm",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-foreground border-border hover:bg-muted",
        onClick && "cursor-pointer",
        className
      )}
    >
      <span>{children}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:bg-foreground/10 rounded-full p-0.5"
          aria-label="הסר"
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}
