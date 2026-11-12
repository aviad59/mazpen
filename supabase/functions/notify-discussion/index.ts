/**
 * Supabase Edge Function: notify-discussion
 *
 * Called when a new discussion is created.
 * Fetches all push subscriptions except the creator's and sends Web Push.
 *
 * Required Edge Function secrets (set via `supabase secrets set`):
 * VAPID_PUBLIC_KEY   — your VAPID public key
 * VAPID_PRIVATE_KEY  — your VAPID private key
 * VAPID_SUBJECT      — mailto: or https: URI, e.g. "mailto:admin@example.com"
 */

import { adminClient, clampText, filterSubsToAllowedUsers, getAllowedCaller, unauthorized } from "../_shared/security.ts";
import webpush from "npm:web-push";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { discussionName } = await req.json() as {
      discussionName: string;
      creatorUserId?: string; // ignored — derived from the verified token
    };

    // Service-role client bypasses RLS — can read all subscriptions
    const supabase = adminClient();

    // Only signed-in, allow-listed users may trigger notifications.
    // The creator id comes from the verified token, not the request body.
    const caller = await getAllowedCaller(req, supabase);
    if (!caller) return unauthorized(corsHeaders);

    const { data: allSubs, error } = await supabase
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth")
      .neq("user_id", caller.id);

    if (error) throw error;
    // Never push discussion details to users who are no longer allow-listed
    const subs = await filterSubsToAllowedUsers(supabase, allSubs ?? []);
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

    // Configure the web-push library with your VAPID details
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const payload = JSON.stringify({
      title: "מצפן — דיון חדש",
      body: `נוסף דיון: ${clampText(discussionName, 120)}`,
      url: "/",
    });

    let sent = 0;
    const staleEndpoints: string[] = [];

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          const subscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          };

          // Generate the request parameters using npm:web-push
          const requestDetails = webpush.generateRequestDetails(subscription, payload);

          // Execute the push request using native Deno fetch
          const res = await fetch(requestDetails.endpoint, {
            method: requestDetails.method,
            headers: requestDetails.headers,
            body: requestDetails.body,
          });

          if (res.status === 410 || res.status === 404) {
            staleEndpoints.push(sub.endpoint);
          } else if (res.ok) {
            sent++;
          }
        } catch {
          // individual failure — skip
        }
      })
    );

    // Clean up stale/expired subscriptions
    if (staleEndpoints.length > 0) {
      await supabase.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
    }

    return new Response(JSON.stringify({ sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});