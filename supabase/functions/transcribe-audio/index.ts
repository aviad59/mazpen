/**
 * Supabase Edge Function: transcribe-audio
 *
 * Transcribes a short WAV chunk (~6–20s) of a live meeting with Gemini.
 * Tuned for Hebrew speech with English words/phrases mixed in: Hebrew is
 * written in Hebrew script, English stays in Latin letters (no translation,
 * no transliteration).
 *
 * Request body (JSON):
 *   audio          – base64 audio (16 kHz mono WAV from the client)
 *   mimeType       – defaults to "audio/wav"
 *   discussionName – optional, used as context
 *   participants   – optional string[], names for correct spelling
 *   vocabulary     – optional string[], domain terms / acronyms
 *   previousText   – optional tail of the transcript so far (context only)
 *
 * Response: { text: string }  (empty string when there was no speech)
 *
 * Secrets:
 *   GEMINI_API_KEY             – required
 *   GEMINI_TRANSCRIBE_MODEL    – optional, defaults to "gemini-2.5-flash"
 */

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

/** ~45s of 16 kHz 16-bit mono, base64-encoded. */
const MAX_AUDIO_B64 = 2_000_000;

const SYSTEM_PROMPT = `You are a professional verbatim transcriber for work meetings in an Israeli military unit.
The speech is mostly Hebrew, with English words, phrases, acronyms and technical terms mixed in (code-switching).

Rules:
1. Transcribe exactly what is said. Do not translate, summarize, explain or add anything.
2. Write Hebrew speech in Hebrew script, with correct Hebrew spelling (כתיב מלא).
3. Write every English word or phrase in English (Latin letters), exactly as spoken — e.g. "deadline", "feedback", "status", "API", "PowerPoint", "on track", "Excel". Never transliterate English into Hebrew letters and never translate it to Hebrew.
4. English words with Hebrew prefixes/suffixes: write the Hebrew prefix in Hebrew attached with a hyphen, e.g. "ב-deadline", "ה-meeting", "ל-dashboard".
5. Hebrew (including military) acronyms stay in Hebrew with gershayim: רמ"ט, סא"ל, מפק"ד, תא"ל, צה"ל, בה"ד.
6. Loanwords that are normally written in Hebrew (טלפון, אינטרנט, מייל, וואטסאפ) stay in Hebrew unless clearly said as English.
7. Use the participant names and glossary provided to spell names and terms correctly.
8. Add natural punctuation. Start a new line when the speaker clearly changes.
9. Drop meaningless filler sounds (אממ, אהה, ממ) and stutters; keep everything else.
10. The audio is a slice of an ongoing meeting and may start or end mid-sentence — transcribe only what is audible, do not complete cut-off words or sentences. The "previous transcript" is context only — never repeat it.
11. If there is no intelligible speech (silence, noise, music), output nothing at all. Never invent text.

Output only the transcript text — no labels, no quotes, no timestamps, no notes.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Removes typical non-speech outputs like "[שקט]" or "(no speech)". */
function clean(text: string): string {
  const t = text.trim().replace(/^```[a-z]*\s*|\s*```$/g, "").trim();
  if (!t) return "";
  if (/^[\[(（].*[\])）]$/s.test(t) && t.length < 40) return "";
  if (/^(no speech|silence|inaudible|אין דיבור|שקט)\.?$/i.test(t)) return "";
  return t;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (!(await getAllowedCaller(req, adminClient()))) return json({ error: "Unauthorized" }, 401);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "GEMINI_API_KEY is not configured", code: "not_configured" }, 500);
  const model = Deno.env.get("GEMINI_TRANSCRIBE_MODEL") || "gemini-2.5-flash";

  let body: {
    audio?: string;
    mimeType?: string;
    discussionName?: string;
    participants?: string[];
    vocabulary?: string[];
    previousText?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const audio = body.audio ?? "";
  if (!audio) return json({ error: "Missing audio" }, 400);
  if (audio.length > MAX_AUDIO_B64) return json({ error: "Audio chunk too large" }, 413);

  if (typeof audio !== "string" || !/^[A-Za-z0-9+/=]+$/.test(audio)) return json({ error: "Invalid audio" }, 400);
  const mimeType = "audio/wav"; // the client always sends 16 kHz WAV

  const asList = (v: unknown) => (Array.isArray(v) ? v : []);
  const names = asList(body.participants).map((n) => clampText(n, 80)).filter(Boolean).slice(0, 80);
  const vocab = asList(body.vocabulary).map((v) => clampText(v, 80)).filter(Boolean).slice(0, 200);
  const previous = clampText(String(body.previousText ?? "").slice(-600), 600);
  const discussionName = clampText(body.discussionName, 200);

  const context =
    `Meeting: ${discussionName || "—"}\n` +
    `Participants: ${names.length ? names.join(", ") : "—"}\n` +
    `Glossary: ${vocab.length ? vocab.join(", ") : "—"}\n` +
    `Previous transcript (context only, do not repeat): ${previous || "—"}\n\n` +
    `Transcribe the attached audio.`;

  const generationConfig: Record<string, unknown> = { temperature: 0, maxOutputTokens: 2048 };
  // Flash models: skip "thinking" for lower latency — transcription doesn't need it.
  if (/flash/i.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [
                { text: context },
                { inlineData: { mimeType, data: audio } },
              ],
            },
          ],
          generationConfig,
        }),
      }
    );

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data?.error?.message ?? `Gemini request failed (${res.status})`;
      // Free-tier keys hit per-minute limits quickly — tell the client so it can back off and retry.
      if (res.status === 429) return json({ error: msg, code: "rate_limited" }, 429);
      return json({ error: msg }, 502);
    }

    const raw: string = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? "")
      .join("");

    return json({ text: clean(raw), model });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
