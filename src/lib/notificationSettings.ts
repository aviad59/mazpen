/**
 * Per-device notification preferences — persisted to localStorage.
 * Both notifications are enabled by default.
 */
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "mazpen_notification_settings";

interface NotificationSettings {
  notifyNewDiscussion: boolean;
  notifyStatusChange: boolean;
}

const DEFAULTS: NotificationSettings = {
  notifyNewDiscussion: true,
  notifyStatusChange: true,
};

function load(): NotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

let settings: NotificationSettings = load();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage unavailable -- skip silently
  }
}

function setSetting<K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) {
  settings = { ...settings, [key]: value };
  persist();
  emit();
}

/** Read-only snapshot for use outside React components (e.g. store actions). */
export function getNotificationSettings(): NotificationSettings {
  return settings;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return settings;
}

export function useNotificationSettings() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    notifyNewDiscussion: snap.notifyNewDiscussion,
    notifyStatusChange: snap.notifyStatusChange,
    setNotifyNewDiscussion: (v: boolean) => setSetting("notifyNewDiscussion", v),
    setNotifyStatusChange: (v: boolean) => setSetting("notifyStatusChange", v),
  };
}
