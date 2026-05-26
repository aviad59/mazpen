import * as React from "react";
import { supabase } from "./supabaseClient";

// Your VAPID public key — generate with: npx web-push generate-vapid-keys
// Then set VITE_VAPID_PUBLIC_KEY in your .env file
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export type PushState =
  | "unsupported"
  | "denied"
  | "granted"
  | "idle"
  | "needs_install"
  | "needs_tap"; // iOS standalone: waiting for user gesture before requesting permission

/** True when running on iOS Safari browser tab (not installed to home screen). */
function detectIOSBrowser(): boolean {
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).standalone === true;
  return isIOS && !isStandalone;
}

/** True when running as an installed PWA on iOS (home screen, standalone). */
function detectIOSStandalone(): boolean {
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).standalone === true;
  return isIOS && isStandalone;
}

export function usePushNotifications(userId: string | undefined) {
  const [state, setState] = React.useState<PushState>("idle");

  React.useEffect(() => {
    if (detectIOSBrowser()) {
      // iOS Safari tab: push is unavailable until installed to home screen
      setState("needs_install");
    } else if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setState("unsupported");
    } else if (Notification.permission === "denied") {
      setState("denied");
    } else if (Notification.permission === "granted") {
      // Already granted — re-register subscription in case it lapsed
      setState("granted");
    } else if (detectIOSStandalone()) {
      // iOS installed PWA, permission not yet granted: must wait for a user tap
      setState("needs_tap");
    }
    // Otherwise "idle" — non-iOS can be auto-prompted
  }, []);

  const subscribe = React.useCallback(async () => {
    if (state === "needs_install") return;
    if (!VAPID_PUBLIC_KEY) {
      console.warn("VITE_VAPID_PUBLIC_KEY not set — push notifications disabled");
      return;
    }
    if (!userId) return;

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const keyBytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes.buffer.slice(
          keyBytes.byteOffset,
          keyBytes.byteOffset + keyBytes.byteLength
        ) as ArrayBuffer,
      });

      const json = sub.toJSON();
      const keys = json.keys as { p256dh: string; auth: string };

      await supabase.from("push_subscriptions").upsert(
        {
          user_id: userId,
          endpoint: sub.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
        { onConflict: "endpoint" }
      );

      setState("granted");
    } catch (err) {
      console.error("Push subscription failed", err);
    }
  }, [userId, state]);

  return { state, subscribe };
}
