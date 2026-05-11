import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: React.ReactNode;
  /** mobile = slides from bottom; full = full-screen on mobile */
  size?: "mobile" | "full";
}

/**
 * A bottom-sheet that becomes a centered modal on larger screens.
 * Designed for mobile-first one-hand usage; on phones it slides from bottom.
 */
export function Sheet({ open, onClose, children, title, size = "mobile" }: SheetProps) {
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
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={onClose}
        aria-hidden
      />

      {/* sheet */}
      <div
        className={cn(
          "relative mt-auto w-full bg-background animate-slide-up",
          "border-t border-border shadow-2xl",
          "rounded-t-3xl",
          size === "mobile" && "max-h-[92vh]",
          size === "full" && "h-[100dvh] rounded-none",
          "md:max-w-xl md:mx-auto md:mb-6 md:rounded-3xl md:border md:max-h-[88vh]"
        )}
        role="dialog"
        aria-modal="true"
      >
        {/* grabber */}
        <div className="flex justify-center pt-2 pb-1 md:hidden">
          <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
        </div>

        {/* header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <h2 className="text-base font-semibold text-balance">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-muted no-tap-highlight"
            aria-label="סגירה"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-6 scrollbar-thin safe-bottom">
          {children}
        </div>
      </div>
    </div>
  );
}
