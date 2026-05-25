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

export type PushState = "unsupported" | "denied" | "granted" | "idle";

export function usePushNotifications(userId: string | undefined) {
  const [state, setState] = React.useState<PushState>("idle");

  // On mount, check current permission
  React.useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setState("unsupported");
    } else if (Notification.permission === "denied") {
      setState("denied");
    } else if (Notification.permission === "granted") {
      setState("granted");
    }
  }, []);

  async function subscribe() {
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
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
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
  }

  return { state, subscribe };
}
