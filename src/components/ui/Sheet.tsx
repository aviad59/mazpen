import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: React.ReactNode;
  /** mobile = bottom sheet with grabber; full = full-screen on mobile */
  size?: "mobile" | "full";
  /** Optional sticky footer node (e.g. action buttons). */
  footer?: React.ReactNode;
}

/**
 * Bottom-sheet that turns into a centered modal on desktop.
 * Layout is a strict flex column so the body scrolls but the
 * header & footer stay fixed within the sheet bounds.
 */
export function Sheet({
  open,
  onClose,
  children,
  title,
  size = "mobile",
  footer,
}: SheetProps) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handler);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          "relative mt-auto w-full bg-background animate-slide-up flex flex-col",
          "border-t border-border shadow-2xl rounded-t-3xl",
          size === "mobile" && "max-h-[92dvh]",
          size === "full" && "h-[100dvh] rounded-none",
          "md:max-w-xl md:mx-auto md:mb-6 md:rounded-3xl md:border md:max-h-[88dvh]"
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex justify-center pt-2 pb-1 md:hidden shrink-0">
          <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="flex items-center justify-between px-5 pt-1 pb-3 shrink-0 border-b border-border/60">
          <h2 className="text-base font-semibold text-balance min-w-0 truncate pr-2">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-muted no-tap-highlight shrink-0"
            aria-label="סגירה"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-5 py-4">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-border bg-background px-5 py-3 safe-bottom">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
