import * as React from "react";
import { Bell, X } from "lucide-react";

interface Props {
  onEnable: () => void;
}

/**
 * Shown to iOS users who have installed the PWA but haven't granted
 * notification permission yet. The button tap provides the user gesture
 * iOS requires before showing the native permission prompt.
 */
export function EnableNotificationsBanner({ onEnable }: Props) {
  const [dismissed, setDismissed] = React.useState(
    () => !!localStorage.getItem("notif_banner_dismissed")
  );

  if (dismissed) return null;

  function dismiss() {
    localStorage.setItem("notif_banner_dismissed", "1");
    setDismissed(true);
  }

  function handleEnable() {
    dismiss();
    onEnable();
  }

  return (
    <div className="fixed bottom-20 inset-x-3 z-50 rounded-xl border border-violet-200 bg-violet-50 dark:bg-violet-950 dark:border-violet-800 shadow-lg p-4 flex items-start gap-3">
      <Bell size={18} className="text-violet-600 dark:text-violet-300 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-violet-800 dark:text-violet-200 mb-1">
          הפעל התראות
        </p>
        <p className="text-xs text-violet-700 dark:text-violet-300 leading-relaxed mb-2">
          קבל התראות כשנוספים דיונים חדשים.
        </p>
        <button
          onClick={handleEnable}
          className="text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-3 py-1.5 transition-colors"
        >
          אפשר התראות
        </button>
      </div>
      <button
        onClick={dismiss}
        className="p-1 rounded-full text-muted-foreground hover:bg-violet-100 dark:hover:bg-violet-900 shrink-0"
        aria-label="סגור"
      >
        <X size={14} />
      </button>
    </div>
  );
}
