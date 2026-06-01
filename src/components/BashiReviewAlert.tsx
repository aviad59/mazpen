import * as React from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "./ui/Button";
import type { Discussion } from "@/types";

interface Props {
  discussions: Discussion[];
  onClose: () => void;
  onOpen: (id: string) => void;
}

export function BashiReviewAlert({ discussions, onClose, onOpen }: Props) {
  if (discussions.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-sm rounded-2xl bg-background border border-warning/40 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 bg-warning/10 px-4 py-3 border-b border-warning/20">
          <div className="flex items-center gap-2 text-warning-foreground">
            <AlertTriangle size={18} className="text-warning shrink-0" />
            <span className="font-semibold text-sm">
              {discussions.length === 1
                ? "דיון אחד דורש מעבר שלך"
                : `${discussions.length} דיונים דורשים מעבר שלך`}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded"
            aria-label="סגור"
          >
            <X size={16} />
          </button>
        </div>

        {/* List */}
        <ul className="divide-y divide-border max-h-64 overflow-y-auto">
          {discussions.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => { onOpen(d.id); onClose(); }}
                className="w-full text-right px-4 py-3 text-sm hover:bg-muted/60 transition-colors"
              >
                <span className="font-medium">{d.name}</span>
              </button>
            </li>
          ))}
        </ul>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border">
          <Button variant="ghost" className="w-full" onClick={onClose}>
            הבנתי, סגור
          </Button>
        </div>
      </div>
    </div>
  );
}
