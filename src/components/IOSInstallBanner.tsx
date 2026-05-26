import { Share, X } from "lucide-react";
import * as React from "react";

/**
 * Shown to iOS users who opened the app in Safari (not installed).
 * Explains how to add to home screen so push notifications work.
 */
export function IOSInstallBanner() {
  const [dismissed, setDismissed] = React.useState(
    () => !!localStorage.getItem("ios_banner_dismissed")
  );

  if (dismissed) return null;

  function dismiss() {
    localStorage.setItem("ios_banner_dismissed", "1");
    setDismissed(true);
  }

  return (
    <div className="fixed bottom-20 inset-x-3 z-50 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800 shadow-lg p-4">
      <button
        onClick={dismiss}
        className="absolute top-2 left-2 p-1 rounded-full text-muted-foreground hover:bg-blue-100 dark:hover:bg-blue-900"
        aria-label="סגור"
      >
        <X size={14} />
      </button>
      <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">
        הוסף למסך הבית לקבלת התראות
      </p>
      <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
        לחץ על{" "}
        <Share size={12} className="inline mx-0.5 align-middle" />
        {" "}בסרגל הכלים של Safari, ואז{" "}
        <strong>הוסף למסך הבית</strong>.
        לאחר ההתקנה תוכל לקבל התראות על דיונים חדשים.
      </p>
    </div>
  );
}
