/**
 * Supabase Edge Function: polish-transcript
 *
 * Cleans up raw browser speech recognition (Hebrew, with English words mixed in)
 * using Claude: fixes obvious misrecognitions, writes English words in Latin
 * letters instead of Hebrew transliteration, adds punctuation, and corrects
 * names from the participant list. It never adds content that wasn't said.
 *
 * Request body (JSON):
 *   lines          – string[] raw transcript lines (max 400)
 *   discussionName – optional context
 *   participants   – optional string[] names for correct spelling
 *   vocabulary     – optional string[] domain terms / acronyms
 *
 * Response: { lines: string[] } — same length and order as the input.
 *
 * Secrets:
 *   ANTHROPIC_API_KEY – required
 *   CLAUDE_MODEL      – optional, defaults to "claude-sonnet-5-5"
 */

import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";

// ---- security helpers (kept inline: the API deploy doesn't bundle shared folders) ----
// Callers must be signed in AND on allowed_emails.
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

/** Trims and caps user-supplied text that ends up in prompts. */
function clampText(v: unknown, max: number): string {
  return String(v ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, max);
}
// ---- end security helpers ----

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "claude-sonnet-5-5";
const MAX_LINES = 400;
const MAX_LINE_CHARS = 2000;

const SYSTEM_PROMPT = `You correct raw automatic speech recognition (ASR) output from work meetings in an Israeli military unit.
The speech is mostly Hebrew with English words, phrases, acronyms and technical terms mixed in. The browser's Hebrew recognizer often gets these wrong.

For each input line, return the corrected line. Rules:
1. Keep the meaning and wording of what was said. Do not summarize, shorten, translate, reorder, or add anything that wasn't said.
2. Fix obvious misrecognitions using context — words that sound alike but make no sense in the sentence.
3. English words that the recognizer wrote in Hebrew letters go back to English (Latin letters): "דדליין" → "deadline", "פידבק" → "feedback", "סטטוס" → "status", "גירה" → "Jira", "דשבורד" → "dashboard". Keep Hebrew prefixes attached with a hyphen: "בדדליין" → "ב-deadline".
   Loanwords normally written in Hebrew (טלפון, מייל, אינטרנט, וואטסאפ) stay in Hebrew.
4. Hebrew acronyms take gershayim: רמט → רמ"ט, סאל → סא"ל, צהל → צה"ל.
5. Spell names and terms as in the participant list and glossary when a line clearly refers to them.
6. Add natural punctuation (periods, commas, question marks).
7. If a line is unintelligible, return it unchanged. Never invent content to fill gaps.
Return exactly one output line per input line, in the same order.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (!(await getAllowedCaller(req, adminClient()))) return json({ error: "Unauthorized" }, 401);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY is not configured", code: "not_configured" }, 500);
  const model = Deno.env.get("CLAUDE_MODEL")?.trim() || DEFAULT_MODEL;

  let body: { lines?: unknown; discussionName?: unknown; participants?: unknown; vocabulary?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!Array.isArray(body.lines) || body.lines.length === 0) return json({ error: "Missing lines" }, 400);
  if (body.lines.length > MAX_LINES) return json({ error: `Too many lines (max ${MAX_LINES})` }, 413);
  const lines = body.lines.map((l) => clampText(l, MAX_LINE_CHARS));

  const asList = (v: unknown) => (Array.isArray(v) ? v : []);
  const names = asList(body.participants).map((n) => clampText(n, 80)).filter(Boolean).slice(0, 80);
  const vocab = asList(body.vocabulary).map((v) => clampText(v, 80)).filter(Boolean).slice(0, 200);

  const userText =
    `Meeting: ${clampText(body.discussionName, 200) || "—"}\n` +
    `Participants: ${names.length ? names.join(", ") : "—"}\n` +
    `Glossary: ${vocab.length ? vocab.join(", ") : "—"}\n\n` +
    `Input lines (${lines.length}), as a JSON array:\n${JSON.stringify(lines)}`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userText }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { lines: { type: "array", items: { type: "string" } } },
            required: ["lines"],
            additionalProperties: false,
          },
        },
      },
    });

    if (response.stop_reason === "refusal") return json({ error: "המודל סירב לעבד את התמלול הזה" }, 502);
    if (response.stop_reason === "max_tokens") return json({ error: "התמלול ארוך מדי לשיפור בבת אחת" }, 413);

    const raw = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    let out: unknown;
    try {
      out = (JSON.parse(raw) as { lines?: unknown }).lines;
    } catch {
      return json({ error: "Claude returned invalid JSON" }, 502);
    }
    if (!Array.isArray(out) || out.length !== lines.length) {
      // Line count must match so each correction maps back to its line; otherwise keep the originals.
      return json({ error: "Claude returned a different number of lines", code: "line_mismatch" }, 502);
    }

    return json({
      lines: out.map((l, i) => (typeof l === "string" && l.trim() ? l.trim() : lines[i])),
      model: response.model,
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: err.message, code: "rate_limited" }, 429);
    if (err instanceof Anthropic.AuthenticationError) return json({ error: "ANTHROPIC_API_KEY is invalid" }, 500);
    if (err instanceof Anthropic.APIError) return json({ error: err.message }, 502);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
