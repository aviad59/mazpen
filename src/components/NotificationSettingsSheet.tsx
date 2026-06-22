import { Bell, CalendarPlus, RefreshCw } from "lucide-react";
import { Sheet } from "./ui/Sheet";
import { Switch } from "./ui/Switch";
import { useNotificationSettings } from "@/lib/notificationSettings";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NotificationSettingsSheet({ open, onClose }: Props) {
  const {
    notifyNewDiscussion,
    notifyStatusChange,
    setNotifyNewDiscussion,
    setNotifyStatusChange,
  } = useNotificationSettings();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Bell size={18} className="text-accent" />
          הגדרות התראות
        </span>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <Switch
            id="notify-new-discussion"
            checked={notifyNewDiscussion}
            onChange={setNotifyNewDiscussion}
            label={
              <span className="flex items-center gap-1.5">
                <CalendarPlus size={15} className="text-muted-foreground" />
                התראה על דיון חדש
              </span>
            }
          />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <Switch
            id="notify-status-change"
            checked={notifyStatusChange}
            onChange={setNotifyStatusChange}
            label={
              <span className="flex items-center gap-1.5">
                <RefreshCw size={15} className="text-muted-foreground" />
                התראה על שינוי סטטוס
              </span>
            }
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          ההגדרות נשמרות במכשיר זה בלבד.
        </p>
      </div>
    </Sheet>
  );
}
