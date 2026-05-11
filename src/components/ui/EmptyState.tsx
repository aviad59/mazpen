import * as React from "react";
import { cn } from "@/lib/utils";

interface Props {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  className?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, hint, className, action }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-8 px-4 text-muted-foreground",
        className
      )}
    >
      {icon && (
        <div className="mb-2 opacity-40">{icon}</div>
      )}
      <p className="text-sm font-medium text-foreground/70">{title}</p>
      {hint && <p className="text-xs mt-1">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
