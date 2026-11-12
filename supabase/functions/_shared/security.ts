/**
 * Shared security helpers for Edge Functions.
 * (Folders starting with "_" are not deployed as functions themselves.)
 *
 * The anon key is public, so Supabase's built-in JWT check alone lets anyone
 * call a function. These helpers additionally require that the caller is a
 * signed-in user whose email is on the `allowed_emails` list — the same rule
 * the app UI and the RLS policies use.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function adminClient(): SupabaseClient {
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
export async function getAllowedCaller(
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
export async function filterSubsToAllowedUsers<T extends { user_id: string }>(
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
export function clampText(v: unknown, max: number): string {
  return String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

export function unauthorized(headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
