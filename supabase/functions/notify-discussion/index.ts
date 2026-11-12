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

import webpush from "npm:web-push@3.6.7";

// ---- security helpers (kept inline: the API deploy doesn't bundle shared folders) ----
// Callers must be signed in AND on allowed_emails; pushes go only to allow-listed users.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function loadAllowedEmails(admin: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await admin.from("allowed_emails").select("email");
  if (error) throw error;
  return new Set((data ?? []).map((r: { email: string }) => r.email.trim().toLowerCase()));
}

/** Returns the verified, allow-listed caller, or null if the request must be rejected. */
async function getAllowedCaller(
  req: Request,
  admin: SupabaseClient
): Promise<{ id: string; email: string } | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  const email = data?.user?.email?.trim().toLowerCase();
  if (error || !data?.user || !email) return null;
  const allowed = await loadAllowedEmails(admin);
  return allowed.has(email) ? { id: data.user.id, email } : null;
}

/** Keeps only push subscriptions whose owner is still on the allow-list. */
async function filterSubsToAllowedUsers<T extends { user_id: string }>(
  admin: SupabaseClient,
  subs: T[]
): Promise<T[]> {
  if (subs.length === 0) return subs;
  const allowed = await loadAllowedEmails(admin);
  const userIds = [...new Set(subs.map((s) => s.user_id))];
  const okIds = new Set<string>();
  await Promise.all(
    userIds.map(async (uid) => {
      const { data } = await admin.auth.admin.getUserById(uid);
      const email = data?.user?.email?.trim().toLowerCase();
      if (email && allowed.has(email)) okIds.add(uid);
    })
  );
  return subs.filter((s) => okIds.has(s.user_id));
}

/** Trims and caps user-supplied text that ends up in notifications / prompts. */
function clampText(v: unknown, max: number): string {
  return String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function unauthorized(headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
// ---- end security helpers ----

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
    const subs = await filterSubsToAllowedUsers(
      supabase,
      (allSubs ?? []) as { user_id: string; endpoint: string; p256dh: string; auth: string }[]
    );
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