/**
 * Debounces outgoing push notifications keyed by an arbitrary string (e.g. a
 * discussion id). Scheduling a notification under a key that already has a
 * pending one replaces it, and cancelling removes it outright — so a quick
 * create-then-delete (or a flurry of status changes) collapses into at most
 * one push, or none at all.
 */
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, () => void>();

const NOTIFY_DEBOUNCE_MS = 8000;

export function scheduleNotification(key: string, send: () => void, delayMs = NOTIFY_DEBOUNCE_MS) {
  cancelNotification(key);
  const timer = setTimeout(() => {
    timers.delete(key);
    pending.delete(key);
    send();
  }, delayMs);
  timers.set(key, timer);
  pending.set(key, send);
}

export function cancelNotification(key: string) {
  const timer = timers.get(key);
  if (timer) {
    clearTimeout(timer);
    timers.delete(key);
  }
  pending.delete(key);
}

// Mobile browsers suspend timers once the tab/PWA is backgrounded, so an
// 8s debounce can simply never fire if the user switches away right after
// triggering it. Flush everything still pending the moment the page is
// about to leave the foreground, so delivery is guaranteed either way.
function flushAll() {
  for (const [key, send] of pending) {
    const timer = timers.get(key);
    if (timer) clearTimeout(timer);
    timers.delete(key);
    pending.delete(key);
    send();
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAll();
  });
  window.addEventListener("pagehide", flushAll);
}
