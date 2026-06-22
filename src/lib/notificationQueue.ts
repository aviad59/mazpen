/**
 * Debounces outgoing push notifications keyed by an arbitrary string (e.g. a
 * discussion id). Scheduling a notification under a key that already has a
 * pending one replaces it, and cancelling removes it outright — so a quick
 * create-then-delete (or a flurry of status changes) collapses into at most
 * one push, or none at all.
 */
const timers = new Map<string, ReturnType<typeof setTimeout>>();

const NOTIFY_DEBOUNCE_MS = 8000;

export function scheduleNotification(key: string, send: () => void, delayMs = NOTIFY_DEBOUNCE_MS) {
  cancelNotification(key);
  const timer = setTimeout(() => {
    timers.delete(key);
    send();
  }, delayMs);
  timers.set(key, timer);
}

export function cancelNotification(key: string) {
  const timer = timers.get(key);
  if (timer) {
    clearTimeout(timer);
    timers.delete(key);
  }
}
