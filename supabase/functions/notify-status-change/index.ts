/**
 * Supabase Edge Function: notify-status-change
 *
 * Called when a discussion's status changes.
 * Sends a Web Push notification to all other subscribed users.
 *
 * Required Edge Function secrets (same as notify-discussion):
 * VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 *
 * Deployed via the deploy-supabase-functions.yml CI workflow.
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
    const { discussionName, statusLabel } = await req.json() as {
      discussionName: string;
      statusLabel: string;
      creatorUserId?: string; // ignored — derived from the verified token
    };

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

    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
      Deno.env.get("VAPID_PUBLIC_KEY")!,
      Deno.env.get("VAPID_PRIVATE_KEY")!
    );

    const payload = JSON.stringify({
      title: "מצפן — שינוי סטטוס",
      body: `${clampText(discussionName, 120)}: ${clampText(statusLabel, 60)}`,
      url: "/",
    });

    let sent = 0;
    const staleEndpoints: string[] = [];

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          const requestDetails = webpush.generateRequestDetails(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          const res = await fetch(requestDetails.endpoint, {
            method: requestDetails.method,
            headers: requestDetails.headers,
            body: requestDetails.body,
          });
          if (res.status === 410 || res.status === 404) staleEndpoints.push(sub.endpoint);
          else if (res.ok) sent++;
        } catch { /* individual failure — skip */ }
      })
    );

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
