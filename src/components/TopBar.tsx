import { Bell, Compass, LogOut, Plus, Search, Trash2, Users } from "lucide-react";
import { Button } from "./ui/Button";
import { APP_NAME, APP_TAGLINE } from "@/lib/he";

interface Props {
  onAdd: () => void;
  onOpenSearch: () => void;
  onOpenParticipants: () => void;
  onOpenNotificationSettings: () => void;
  onClearAll: () => void;
  pendingScheduling: number;
  onSignOut?: () => void;
  userEmail?: string;
}

export function TopBar({
  onAdd,
  onOpenSearch,
  onOpenParticipants,
  onOpenNotificationSettings,
  onClearAll,
  pendingScheduling,
  onSignOut,
  userEmail,
}: Props) {
  return (
    <header className="sticky top-0 z-30 glass border-b border-border safe-top">
      <div className="flex items-center gap-1 px-3 py-2.5">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Compass size={18} />
          </div>
          <div className="leading-tight min-w-0">
            <h1 className="text-[15px] font-bold tracking-tight truncate">
              {APP_NAME}
            </h1>
            <p className="text-[11px] text-muted-foreground truncate">
              {APP_TAGLINE}
              {pendingScheduling > 0 && (
                <span className="ml-1 text-muted-foreground font-medium">
                  · {pendingScheduling} ללא מסגרת זמן
                </span>
              )}
            </p>
          </div>
        </div>

        <button
          onClick={onOpenSearch}
          className="rounded-lg p-2 hover:bg-muted no-tap-highlight"
          aria-label="חיפוש"
          title="חיפוש"
        >
          <Search size={18} />
        </button>
        <button
          onClick={onOpenParticipants}
          className="rounded-lg p-2 hover:bg-muted no-tap-highlight"
          aria-label="ניהול משתתפים וקבוצות"
          title="ניהול משתתפים וקבוצות"
        >
          <Users size={18} />
        </button>
        <button
          onClick={onOpenNotificationSettings}
          className="rounded-lg p-2 hover:bg-muted no-tap-highlight"
          aria-label="הגדרות התראות"
          title="הגדרות התראות"
        >
          <Bell size={18} />
        </button>
        <button
          onClick={onClearAll}
          className="rounded-lg p-2 hover:bg-muted no-tap-highlight text-muted-foreground"
          aria-label="מחיקת כל הנתונים"
          title="מחיקת כל הנתונים"
        >
          <Trash2 size={16} />
        </button>
        {onSignOut && (
          <button
            onClick={onSignOut}
            className="rounded-lg p-2 hover:bg-muted no-tap-highlight text-muted-foreground"
            aria-label="התנתק"
            title={userEmail ? `התנתק (${userEmail})` : "התנתק"}
          >
            <LogOut size={16} />
          </button>
        )}
        <Button size="sm" onClick={onAdd} className="rounded-lg">
          <Plus size={16} />
          <span className="hidden sm:inline">דיון</span>
        </Button>
      </div>
    </header>
  );
}
