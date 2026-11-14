/**
 * Mazpen MCP Server — Supabase Edge Function
 *
 * Implements the Model Context Protocol (Streamable HTTP transport, JSON-RPC 2.0).
 * Lets an AI agent read and manage discussions, participants, groups, tasks and
 * discussion requests — the same operations the app offers.
 *
 * Input handling: every tool has one zod schema. It validates the arguments and
 * is also what tools/list advertises, so the two never drift. Bad arguments come
 * back as a normal tool result with isError: true listing every problem at once,
 * so the model can read it and retry. Participants, users, groups, discussions,
 * tasks and requests can be referred to by id or by exact name / alias.
 *
 * Authentication: Bearer token matched against the MCP_API_KEY secret.
 * If MCP_API_KEY is not set the endpoint rejects every request (fail closed).
 *
 * Deploy:
 *   supabase functions deploy mcp
 *   supabase secrets set MCP_API_KEY=<your-secret-key>
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@4.6.7";

// ---------------------------------------------------------------------------
// CORS / common headers
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, mcp-protocol-version",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

// ---------------------------------------------------------------------------
// Hebrew labels — handy context for the AI agent
// ---------------------------------------------------------------------------

const STATUSES = [
  "new",
  "coordinated",
  "occurred",
  "waiting_summary",
  "waiting_approval",
  "distributed",
  "cancelled",
] as const;
const DATE_WINDOWS = ["this_week", "next_week", "later", "in_a_month", "unspecified"] as const;
const RECURRENCES = ["none", "twice_weekly", "thrice_weekly", "weekly", "biweekly", "triweekly", "monthly"] as const;

/** Statuses after which a discussion no longer needs anyone's attendance. */
const CLOSED_STATUSES = new Set(["occurred", "distributed", "cancelled"]);

const DATE_WINDOW_LABEL: Record<string, string> = {
  this_week: "השבוע",
  next_week: "שבוע הבא",
  later: "בהמשך (2-4 שבועות)",
  in_a_month: "בעוד חודש+",
  unspecified: "לא נקבע",
};

const STATUS_LABEL: Record<string, string> = {
  new: "חדש — בתכנון",
  coordinated: "מתואם — ממתין לביצוע",
  occurred: "התקיים",
  waiting_summary: "ממתין לסיכום",
  waiting_approval: "ממתין לאישור סיכום",
  distributed: "הופץ",
  cancelled: "בוטל",
};

// Same short labels the app uses in history entries (useStore.statusLabelFor)
const STATUS_SHORT_LABEL: Record<string, string> = {
  new: "חדש",
  coordinated: "תואם",
  occurred: "התקיים",
  waiting_summary: "מחכה לסיכום",
  waiting_approval: "האם אושר סיכום",
  distributed: "הופץ",
  cancelled: "בוטל",
};

// Same labels the app uses in window_changed history entries (he.ts WINDOW_LABEL)
const WINDOW_HISTORY_LABEL: Record<string, string> = {
  this_week: "השבוע",
  next_week: "שבוע הבא",
  later: "שבועיים עד חודש",
  in_a_month: "בעוד חודש",
  unspecified: "לא קבוע",
};

// Same labels as he.ts RECURRENCE_LABEL
const RECURRENCE_LABEL: Record<string, string> = {
  none: "חד-פעמי",
  twice_weekly: "פעמיים בשבוע",
  thrice_weekly: "שלוש פעמים בשבוע",
  weekly: "כל שבוע",
  biweekly: "כל שבועיים",
  triweekly: "כל שלושה שבועות",
  monthly: "כל חודש",
};

// Status moves the app offers (DiscussionDetail getNextActions / PREV_STATUS)
const PREV_STATUS: Record<string, string | null> = {
  new: null,
  coordinated: "new",
  occurred: "coordinated",
  waiting_summary: "coordinated",
  waiting_approval: "waiting_summary",
  distributed: "waiting_summary",
  cancelled: null,
};

function allowedNextStatuses(status: string, requiresSummary: boolean): string[] {
  const forward: Record<string, string[]> = {
    new: ["coordinated"],
    coordinated: [requiresSummary ? "waiting_summary" : "occurred"],
    waiting_summary: ["distributed"],
    waiting_approval: ["distributed"],
    cancelled: ["new"],
  };
  const next = [...(forward[status] ?? [])];
  const prev = PREV_STATUS[status];
  if (prev) next.push(prev);
  if (status !== "cancelled") next.push("cancelled");
  return next;
}

/** Returns the ISO date string of the Monday of the week offset by `weekOffset` from now. */
function mondayOfWeek(weekOffset: number): string {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day) + weekOffset * 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function scheduledWeekForWindow(w: string): string | null {
  if (w === "this_week") return mondayOfWeek(0);
  if (w === "next_week") return mondayOfWeek(1);
  if (w === "later") return mondayOfWeek(2);
  if (w === "in_a_month") return mondayOfWeek(4);
  return null;
}

/** Same rule as the app's he.ts isPEDiscussion: פע / פ"ע / פא / פ"א have no leader. */
function isPEDiscussion(name: string): boolean {
  const t = name.trim();
  if (t.length < 2 || t[0] !== "פ") return false;
  if (t[1] === "ע" || t[1] === "א") return true;
  return t.length >= 3 && (t[2] === "ע" || t[2] === "א");
}

function randomId(prefix: string, length = 12): string {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "").slice(0, length)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

// ---------------------------------------------------------------------------
// Argument building blocks
//
// Models often send "45" for 45, "true" for true, or one string where a list is
// expected. Those are accepted; anything else is reported, never silently dropped.
// Defaults are applied in the handlers, not with .default(), so they don't show up
// as required fields in the advertised JSON Schema.
// ---------------------------------------------------------------------------

const numish = (v: unknown) =>
  typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v;

const boolish = (v: unknown) => (v === "true" ? true : v === "false" ? false : v);

const listish = (v: unknown) => {
  if (typeof v !== "string") return v;
  if (v.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // not JSON — treat as a single item
    }
  }
  return [v];
};

const zRef = z.string().trim().min(1, "must not be empty").max(200);

const zId = (what: string) => zRef.describe(`${what} id, or its exact name`);

const zRefs = (description: string) =>
  z.preprocess(listish, z.array(zRef).max(200)).optional().describe(description);

const zNames = (description: string) =>
  z.preprocess(listish, z.array(zRef).max(100)).optional().describe(description);

const zBool = (description: string) => z.preprocess(boolish, z.boolean()).optional().describe(description);

const zRequiredText = (description: string, max = 300) =>
  z.string().trim().min(1, "must not be empty").max(max).describe(description);

const zText = (description: string, max = 300) =>
  z.string().trim().min(1, "must not be empty").max(max).optional().describe(description);

/** "" or null clears the field. */
const zClearableText = (description: string, max = 5000) =>
  z.string().trim().max(max).nullable().optional().describe(description);

const zMinutes = (description: string) =>
  z.preprocess(numish, z.number().int("must be a whole number of minutes").min(0).max(1440).nullable())
    .optional()
    .describe(description);

const zStatus = z.enum(STATUSES);
const zWindow = z.enum(DATE_WINDOWS);
const zRecurrence = z.enum(RECURRENCES);

const zRequestedBy = zText(
  "Name of the person who asked you to make this change. Every change is recorded in the discussion " +
    "history as made by the AI agent; this name is shown alongside. Always pass it when you know who asked.",
  100
);

const REF_HELP = "Each item may be a participant id, exact name or alias.";

// Old argument names, renamed before validation so existing prompts keep working.
const LEGACY_KEYS: Record<string, string> = {
  participantIds: "participants",
  leaderId: "leader",
  responsibleId: "responsible",
};

// ---------------------------------------------------------------------------
// Errors & name resolution
// ---------------------------------------------------------------------------

/** A problem the caller can fix. Returned to the model as an isError tool result. */
class ToolError extends Error {}

function failIfAny(problems: string[]) {
  if (problems.length) throw new ToolError(problems.join("\n"));
}

/** Case / whitespace / Hebrew-quote insensitive form used for name matching. */
function norm(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/["'`׳״“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = above;
    }
  }
  return row[b.length];
}

interface LookupSpec {
  kind: string;
  listTool: string;
  keysOf: (row: AnyRow) => string[];
  describe: (row: AnyRow) => string;
  /** Appended when nothing matches, e.g. how to add the missing item. */
  notFoundHint?: string;
}

const PARTICIPANT: LookupSpec = {
  kind: "participant",
  listTool: "list_participants",
  keysOf: (p) => [p.name, ...((p.aliases as string[] | null) ?? [])],
  describe: (p) => `${p.id} (${[p.name, p.role].filter(Boolean).join(", ")})`,
  notFoundHint: "If this is a new person, add them with create_participant first, then call again.",
};

const PROFILE: LookupSpec = {
  kind: "user",
  listTool: "list_profiles",
  keysOf: (u) => [u.display_name, u.email, (u.email as string | null)?.split("@")[0]].filter(Boolean),
  describe: (u) => `${u.id} (${[u.display_name, u.email].filter(Boolean).join(", ")})`,
};

const GROUP: LookupSpec = {
  kind: "group",
  listTool: "list_groups",
  keysOf: (g) => [g.name],
  describe: (g) => `${g.id} (${g.name})`,
};

const DISCUSSION: LookupSpec = {
  kind: "discussion",
  listTool: "list_discussions",
  keysOf: (d) => [d.name],
  describe: (d) => `${d.id} (${d.name}, ${d.status})`,
};

const TASK: LookupSpec = {
  kind: "task",
  listTool: "list_tasks",
  keysOf: (t) => [t.title],
  describe: (t) => `${t.id} (${t.title}${t.done ? ", done" : ""})`,
};

const REQUEST: LookupSpec = {
  kind: "request",
  listTool: "list_requests",
  keysOf: (r) => [r.title],
  describe: (r) => `${r.id} (${r.title}, ${r.status})`,
};

/**
 * Resolves `ref` (id, exact name or alias) to exactly one row. On failure records a
 * problem naming the candidates — or the closest names — and returns undefined.
 */
function lookup(spec: LookupSpec, rows: AnyRow[], ref: string, path: string, problems: string[]): AnyRow | undefined {
  const byId = rows.find((r) => r.id === ref);
  if (byId) return byId;

  const n = norm(ref);
  const hits = rows.filter((r) => spec.keysOf(r).some((k) => norm(k) === n));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    problems.push(`${path}: "${ref}" matches ${hits.length} ${spec.kind}s: ${hits.map(spec.describe).join("; ")}. Pass the id.`);
    return undefined;
  }

  const near = rows
    .filter((r) =>
      spec.keysOf(r).some((k) => {
        const nk = norm(k);
        if (nk.length < 2 || n.length < 2) return false;
        return nk.includes(n) || n.includes(nk) || editDistance(nk, n) <= Math.max(1, Math.floor(n.length / 4));
      })
    )
    .slice(0, 5);
  problems.push(
    `${path}: no ${spec.kind} matches "${ref}".` +
      (near.length ? ` Did you mean: ${near.map(spec.describe).join("; ")}?` : ` Call ${spec.listTool} to see them.`) +
      (spec.notFoundHint ? ` ${spec.notFoundHint}` : "")
  );
  return undefined;
}

/** Resolves a list of refs to unique ids, in order. */
function lookupIds(spec: LookupSpec, rows: AnyRow[], refs: string[], path: string, problems: string[]): string[] {
  const ids: string[] = [];
  refs.forEach((ref, i) => {
    const row = lookup(spec, rows, ref, `${path}[${i}]`, problems);
    if (row && !ids.includes(row.id)) ids.push(row.id as string);
  });
  return ids;
}

// ---------------------------------------------------------------------------
// Per-request context
// ---------------------------------------------------------------------------

interface Ctx {
  db: SupabaseClient;
  now: string;
  participants: () => Promise<AnyRow[]>;
  groups: () => Promise<AnyRow[]>;
  profiles: () => Promise<AnyRow[]>;
}

function makeCtx(db: SupabaseClient): Ctx {
  const cache = new Map<string, Promise<AnyRow[]>>();
  const cached =
    (key: string, query: () => PromiseLike<{ data: AnyRow[] | null; error: unknown }>) => () => {
      if (!cache.has(key)) {
        cache.set(
          key,
          (async () => {
            const { data, error } = await query();
            if (error) throw error;
            return data ?? [];
          })()
        );
      }
      return cache.get(key)!;
    };
  return {
    db,
    now: new Date().toISOString(),
    // select("*") so a not-yet-migrated column (e.g. aliases) doesn't break the query
    participants: cached("participants", () => db.from("participants").select("*").order("name")),
    groups: cached("groups", () => db.from("participant_groups").select("*").order("name")),
    profiles: cached("profiles", () => db.from("profiles").select("id,display_name,email").order("display_name")),
  };
}

/** Finds one row by id, or by exact name/title among the given brief columns. */
async function findRow(ctx: Ctx, table: string, spec: LookupSpec, ref: string, briefColumns: string): Promise<AnyRow> {
  const { data, error } = await ctx.db.from(table).select("*").eq("id", ref).maybeSingle();
  if (error) throw error;
  if (data) return data as AnyRow;

  const { data: all, error: allErr } = await ctx.db.from(table).select(briefColumns);
  if (allErr) throw allErr;
  const problems: string[] = [];
  const hit = lookup(spec, (all ?? []) as unknown as AnyRow[], ref, "id", problems);
  failIfAny(problems);

  const { data: full, error: fullErr } = await ctx.db.from(table).select("*").eq("id", hit!.id).single();
  if (fullErr) throw fullErr;
  return full as AnyRow;
}

const findDiscussion = (ctx: Ctx, ref: string) => findRow(ctx, "discussions", DISCUSSION, ref, "id,name,status");
const findTask = (ctx: Ctx, ref: string) => findRow(ctx, "tasks", TASK, ref, "id,title,done");
const findRequest = (ctx: Ctx, ref: string) => findRow(ctx, "discussion_requests", REQUEST, ref, "id,title,status");

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

function buildParticipantMap(rows: AnyRow[]): Map<string, AnyRow> {
  return new Map(rows.map((p) => [p.id as string, p]));
}

function resolveParticipant(id: string, map: Map<string, AnyRow>) {
  const p = map.get(id);
  return p
    ? {
        id: p.id as string,
        name: p.name as string,
        role: (p.role as string) ?? undefined,
        unit: (p.unit as string) ?? undefined,
        phone: (p.phone as string) ?? undefined,
        aliases: (p.aliases as string[] | null)?.length ? (p.aliases as string[]) : undefined,
      }
    : { id, name: "Unknown" };
}

/** Name of a participant id — or the value itself for a temporary participant / unknown id. */
function nameOf(id: string, map: Map<string, AnyRow>): string {
  return (map.get(id)?.name as string | undefined) ?? id;
}

/** Share link with a name preview for chat apps; undefined when APP_URL isn't configured. */
function discussionUrl(id: string, name: string): string | undefined {
  const appUrl = Deno.env.get("APP_URL")?.replace(/\/+$/, "");
  if (!appUrl) return undefined;
  return `${appUrl}/api/share?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`;
}

function participantOut(p: AnyRow) {
  return {
    id: p.id,
    name: p.name,
    role: (p.role as string | null) ?? undefined,
    unit: (p.unit as string | null) ?? undefined,
    phone: (p.phone as string | null) ?? undefined,
    aliases: (p.aliases as string[] | null)?.length ? p.aliases : undefined,
    external: p.external ?? false,
    optional: p.optional ?? false,
  };
}

function discussionOut(d: AnyRow, pMap: Map<string, AnyRow>, full = false) {
  const leaderId = d.leader_id as string | null;
  const out: AnyRow = {
    id: d.id,
    name: d.name,
    url: discussionUrl(d.id as string, d.name as string),
    status: d.status,
    statusLabel: STATUS_LABEL[d.status as string] ?? d.status,
    dateWindow: d.date_window,
    dateWindowLabel: DATE_WINDOW_LABEL[d.date_window as string] ?? d.date_window,
    scheduledWeek: d.scheduled_week ?? undefined,
    participants: ((d.participant_ids as string[]) ?? []).map((pid) => resolveParticipant(pid, pMap)),
    optionalParticipants: ((d.optional_participant_ids as string[] | null) ?? []).length
      ? (d.optional_participant_ids as string[]).map((pid) => ({ id: pid, name: nameOf(pid, pMap) }))
      : undefined,
    extraParticipants: ((d.extra_participants as string[] | null) ?? []).length ? d.extra_participants : undefined,
    leader: !leaderId
      ? undefined
      : pMap.has(leaderId)
      ? resolveParticipant(leaderId, pMap)
      : { name: leaderId, temporary: true },
    requiresSummary: d.requires_summary,
    requiresSubstrate: d.requires_substrate,
    requiresBashiReview: d.requires_bashi_review ?? false,
    recurrence: d.recurrence,
    durationMinutes: d.duration_minutes ?? undefined,
    notes: d.notes ?? undefined,
    important: d.important ?? false,
    drivingTimePreference: d.driving_time_preference ?? false,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
  if (full) {
    const history = (d.history as AnyRow[] | null) ?? [];
    const cycles = (d.cycles as AnyRow[] | null) ?? [];
    out.summary = d.summary ?? undefined;
    out.history = history.slice(-20).map((h) => ({ kind: h.kind, at: h.at, by: h.by, text: h.text }));
    out.historyTotal = history.length;
    out.completedCycles = cycles.length
      ? cycles.map((c) => ({ number: c.number, status: c.status, closedAt: c.closedAt, summary: c.summary }))
      : undefined;
  }
  return out;
}

function taskOut(t: AnyRow, profiles: AnyRow[]) {
  const owner = t.responsible_id ? profiles.find((u) => u.id === t.responsible_id) : undefined;
  return {
    id: t.id,
    title: t.title,
    description: (t.description as string | null) ?? undefined,
    done: t.done,
    responsible: t.responsible_id
      ? { id: t.responsible_id, name: owner?.display_name ?? "Unknown", email: owner?.email ?? undefined }
      : undefined,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

function groupOut(g: AnyRow, pMap: Map<string, AnyRow>) {
  return {
    id: g.id,
    name: g.name,
    participants: ((g.participant_ids as string[]) ?? []).map((pid) => ({ id: pid, name: nameOf(pid, pMap) })),
  };
}

// ---------------------------------------------------------------------------
// Discussion history — same wording as the app
// ---------------------------------------------------------------------------

function aiEvent(ctx: Ctx, kind: string, text: string, requestedBy: string | undefined, meta: AnyRow = {}): AnyRow {
  return {
    id: randomId("h-", 8),
    kind,
    at: ctx.now,
    by: requestedBy ? `סוכן AI (לבקשת ${requestedBy})` : "סוכן AI",
    text,
    meta: { ...meta, source: "ai", requestedBy: requestedBy ?? null },
  };
}

/** Port of src/lib/historyDiff.ts describeChanges, on DB columns. Only keys present in `patch` are compared. */
function describeChanges(before: AnyRow, patch: AnyRow, pMap: Map<string, AnyRow>): string[] {
  const changes: string[] = [];
  const names = (ids: string[]) => ids.map((id) => nameOf(id, pMap)).join(", ");
  const diff = (key: string) => {
    const b = (before[key] as string[] | null) ?? [];
    const a = (patch[key] as string[] | null) ?? [];
    return { added: a.filter((x) => !b.includes(x)), removed: b.filter((x) => !a.includes(x)) };
  };

  if ("name" in patch && patch.name !== before.name) {
    changes.push(`שם הדיון שונה מ-"${before.name}" ל-"${patch.name}"`);
  }
  if ("participant_ids" in patch) {
    const { added, removed } = diff("participant_ids");
    if (added.length) changes.push(`נוספו משתתפים: ${names(added)}`);
    if (removed.length) changes.push(`הוסרו משתתפים: ${names(removed)}`);
  }
  if ("extra_participants" in patch) {
    const { added, removed } = diff("extra_participants");
    if (added.length) changes.push(`נוספו משתתפים זמניים: ${added.join(", ")}`);
    if (removed.length) changes.push(`הוסרו משתתפים זמניים: ${removed.join(", ")}`);
  }
  if ("optional_participant_ids" in patch) {
    const { added, removed } = diff("optional_participant_ids");
    if (added.length) changes.push(`סומנו כרשות: ${names(added)}`);
    if (removed.length) changes.push(`בוטל סימון רשות: ${names(removed)}`);
  }
  if ("leader_id" in patch && patch.leader_id !== before.leader_id) {
    const oldName = before.leader_id ? nameOf(before.leader_id, pMap) : null;
    const newName = patch.leader_id ? nameOf(patch.leader_id, pMap) : null;
    if (oldName && newName) changes.push(`מוביל הדיון שונה מ-${oldName} ל-${newName}`);
    else if (newName) changes.push(`הוגדר מוביל: ${newName}`);
    else if (oldName) changes.push(`בוטל המוביל (היה ${oldName})`);
  }
  if ("requires_summary" in patch && patch.requires_summary !== before.requires_summary) {
    changes.push(`"דורש סיכום" ${patch.requires_summary ? "הופעל" : "בוטל"}`);
  }
  if ("requires_substrate" in patch && patch.requires_substrate !== before.requires_substrate) {
    changes.push(`"דורש מצע" ${patch.requires_substrate ? "הופעל" : "בוטל"}`);
  }
  if ("recurrence" in patch && patch.recurrence !== before.recurrence) {
    changes.push(
      `תדירות שונתה מ-${RECURRENCE_LABEL[before.recurrence] ?? before.recurrence} ל-${RECURRENCE_LABEL[patch.recurrence] ?? patch.recurrence}`
    );
  }
  if ("duration_minutes" in patch && patch.duration_minutes !== before.duration_minutes) {
    if (patch.duration_minutes === null) changes.push("משך הדיון הוסר");
    else if (before.duration_minutes === null) changes.push(`נקבע משך הדיון: ${patch.duration_minutes} דקות`);
    else changes.push(`משך הדיון שונה מ-${before.duration_minutes} ל-${patch.duration_minutes} דקות`);
  }
  if ("driving_time_preference" in patch && patch.driving_time_preference !== (before.driving_time_preference ?? false)) {
    changes.push(`"עדיפות לזמן נהיגה" ${patch.driving_time_preference ? "הופעלה" : "בוטלה"}`);
  }
  if ("requires_bashi_review" in patch && patch.requires_bashi_review !== (before.requires_bashi_review ?? false)) {
    changes.push(`"דורש מעבר של בשי" ${patch.requires_bashi_review ? "הופעל" : "בוטל"}`);
  }
  if ("notes" in patch && (patch.notes ?? "") !== (before.notes ?? "")) {
    changes.push("ההערות עודכנו");
  }
  if ("important" in patch && patch.important !== (before.important ?? false)) {
    changes.push(patch.important ? "סומן כחשוב" : "בוטל סימון חשוב");
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Discussion participants — shared by create / update / approve
// ---------------------------------------------------------------------------

interface ParticipantChanges {
  participants?: string[];
  addParticipants?: string[];
  removeParticipants?: string[];
  /** create_discussion's name for addGroups */
  groups?: string[];
  addGroups?: string[];
  optionalParticipants?: string[];
  addOptional?: string[];
  removeOptional?: string[];
  extraParticipants?: string[];
  leader?: string | null;
}

interface ParticipantState {
  participant_ids: string[];
  optional_participant_ids: string[];
  extra_participants: string[];
  leader_id: string | null;
}

/**
 * Applies participant changes to `start`, resolving every name, and checks the
 * app's rules: optional people are participants, the leader is a non-optional
 * participant or a temporary one, and a leader is set unless it's a פ"ע/פ"א.
 */
async function applyParticipantChanges(
  ctx: Ctx,
  start: ParticipantState,
  c: ParticipantChanges,
  discussionName: string
): Promise<ParticipantState> {
  const problems: string[] = [];
  const people = await ctx.participants();
  const resolve = (refs: string[] | undefined, path: string) => lookupIds(PARTICIPANT, people, refs ?? [], path, problems);

  let ids = c.participants !== undefined ? resolve(c.participants, "participants") : [...start.participant_ids];
  const add = (more: string[]) => more.forEach((id) => !ids.includes(id) && ids.push(id));

  add(resolve(c.addParticipants, "addParticipants"));
  for (const [key, refs] of [["groups", c.groups], ["addGroups", c.addGroups]] as const) {
    if (!refs?.length) continue;
    const groups = await ctx.groups();
    refs.forEach((ref, i) => {
      const g = lookup(GROUP, groups, ref, `${key}[${i}]`, problems);
      if (g) add((g.participant_ids as string[]) ?? []);
    });
  }

  let optional = c.optionalParticipants !== undefined
    ? resolve(c.optionalParticipants, "optionalParticipants")
    : [...start.optional_participant_ids];
  const addOptional = resolve(c.addOptional, "addOptional");
  optional = [...optional, ...addOptional.filter((id) => !optional.includes(id))];
  // Marking someone optional implies they take part.
  add(optional);

  const removed = resolve(c.removeParticipants, "removeParticipants");
  ids = ids.filter((id) => !removed.includes(id));
  const removedOptional = resolve(c.removeOptional, "removeOptional");
  optional = optional.filter((id) => ids.includes(id) && !removedOptional.includes(id));

  const extras = c.extraParticipants !== undefined
    ? [...new Set(c.extraParticipants)]
    : [...start.extra_participants];

  let leader = start.leader_id;
  if (c.leader !== undefined) {
    if (c.leader === null || c.leader === "") leader = null;
    else {
      const extra = extras.find((n) => norm(n) === norm(c.leader!));
      leader = extra ?? lookup(PARTICIPANT, people, c.leader, "leader", problems)?.id ?? null;
    }
  }
  failIfAny(problems);

  const eligible = [...ids.filter((id) => !optional.includes(id)), ...extras];
  const pMap = buildParticipantMap(people);
  const eligibleText = eligible.length
    ? `Choose one of: ${eligible.map((id) => (pMap.has(id) ? `${id} (${nameOf(id, pMap)})` : `"${id}" (temporary)`)).join("; ")}.`
    : "The discussion has no non-optional participants.";

  if (isPEDiscussion(discussionName)) {
    if (c.leader) problems.push(`leader: פ"ע/פ"א discussions have no leader — omit it.`);
    leader = null;
  } else if (leader && !eligible.includes(leader)) {
    problems.push(
      `leader: ${nameOf(leader, pMap)} must be a non-optional participant or a temporary participant of this discussion` +
        (c.leader === undefined ? " (did you remove or mark optional the current leader? pass a new leader)" : "") +
        `. ${eligibleText}`
    );
  } else if (!leader && eligible.length) {
    problems.push(`leader: required when the discussion has participants (unless it is a פ"ע/פ"א discussion). ${eligibleText}`);
  }
  failIfAny(problems);

  return { participant_ids: ids, optional_participant_ids: optional, extra_participants: extras, leader_id: leader };
}

// ---------------------------------------------------------------------------
// Shared create logic (create_discussion, approve_request)
// ---------------------------------------------------------------------------

interface NewDiscussionInput extends ParticipantChanges {
  name: string;
  dateWindow?: string;
  requiresSummary?: boolean;
  requiresSubstrate?: boolean;
  requiresBashiReview?: boolean;
  recurrence?: string;
  durationMinutes?: number | null;
  notes?: string | null;
  important?: boolean;
  drivingTimePreference?: boolean;
  requestedBy?: string;
}

async function insertDiscussion(ctx: Ctx, input: NewDiscussionInput, defaultWindow: string): Promise<AnyRow> {
  const state = await applyParticipantChanges(
    ctx,
    { participant_ids: [], optional_participant_ids: [], extra_participants: [], leader_id: null },
    input,
    input.name
  );
  const dateWindow = input.dateWindow ?? defaultWindow;
  const row = {
    id: randomId("disc-"),
    name: input.name,
    status: "new",
    date_window: dateWindow,
    scheduled_week: scheduledWeekForWindow(dateWindow),
    participant_ids: state.participant_ids,
    extra_participants: state.extra_participants.length ? state.extra_participants : null,
    optional_participant_ids: state.optional_participant_ids.length ? state.optional_participant_ids : null,
    leader_id: state.leader_id,
    requires_summary: input.requiresSummary ?? true,
    requires_substrate: input.requiresSubstrate ?? true,
    requires_bashi_review: input.requiresBashiReview ?? false,
    recurrence: input.recurrence ?? "none",
    duration_minutes: input.durationMinutes || null,
    notes: input.notes || null,
    summary: null,
    driving_time_preference: input.drivingTimePreference ?? false,
    important: input.important ?? false,
    cycles: [],
    history: [aiEvent(ctx, "created", "הדיון נוצר", input.requestedBy)],
    created_at: ctx.now,
    updated_at: ctx.now,
  };
  const { data, error } = await ctx.db.from("discussions").insert(row).select("*").single();
  if (error) throw error;
  return data as AnyRow;
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

interface Annotations {
  title: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

interface Tool {
  name: string;
  description: string;
  schema: z.ZodObject;
  annotations: Annotations;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any, ctx: Ctx) => Promise<unknown>;
}

function defineTool<S extends z.ZodObject>(t: {
  name: string;
  description: string;
  schema: S;
  annotations: Annotations;
  handler: (args: z.output<S>, ctx: Ctx) => Promise<unknown>;
}): Tool {
  return t as Tool;
}

const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const DELETE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

/** Checks that an update/delete touched a row; a 0-row result means it vanished meanwhile. */
function expectRow<T>(data: T[] | null, what: string): T {
  if (!data?.length) throw new ToolError(`${what} was not found (it may have just been deleted or changed). Look it up again.`);
  return data[0];
}

const TOOLS: Tool[] = [
  // ---- Discussions ---------------------------------------------------------
  defineTool({
    name: "list_discussions",
    description:
      "List discussions. By default only active ones (status new or coordinated); pass `status` to see others. " +
      "Each item includes the scheduling window, participants with their roles, the leader, duration, notes and " +
      "flags. Each item has a `url` that opens the discussion in the app — include it whenever you mention or " +
      "send a discussion to someone. Use get_discussion for the summary and history.",
    annotations: { title: "List discussions", ...READ },
    schema: z.strictObject({
      status: z.preprocess(listish, z.array(zStatus)).optional()
        .describe("Statuses to include (default: new, coordinated)."),
      dateWindow: zWindow.optional().describe("Only discussions in this scheduling window."),
      participant: zText("Only discussions this participant (id, name or alias) takes part in or leads."),
      query: zText("Only discussions whose name or notes contain this text."),
      important: zBool("Only discussions marked (true) or not marked (false) as important."),
    }),
    handler: async (a, ctx) => {
      const people = await ctx.participants();
      const problems: string[] = [];
      const who = a.participant ? lookup(PARTICIPANT, people, a.participant, "participant", problems) : undefined;
      failIfAny(problems);

      let q = ctx.db
        .from("discussions")
        .select(
          "id,name,status,date_window,scheduled_week,participant_ids,extra_participants,optional_participant_ids,leader_id,requires_summary,requires_substrate,requires_bashi_review,recurrence,duration_minutes,notes,important,driving_time_preference,created_at,updated_at"
        )
        .in("status", a.status?.length ? a.status : ["new", "coordinated"])
        .order("created_at", { ascending: false });
      if (a.dateWindow) q = q.eq("date_window", a.dateWindow);
      if (a.important !== undefined) q = q.eq("important", a.important);
      const { data, error } = await q;
      if (error) throw error;

      const text = a.query ? norm(a.query) : null;
      const pMap = buildParticipantMap(people);
      return ((data ?? []) as AnyRow[])
        .filter((d) => !who || ((d.participant_ids as string[]) ?? []).includes(who.id) || d.leader_id === who.id)
        .filter((d) => !text || norm(`${d.name} ${d.notes ?? ""}`).includes(text))
        .map((d) => discussionOut(d, pMap));
    },
  }),

  defineTool({
    name: "get_discussion",
    description:
      "Get one discussion in any status, with everything list_discussions returns plus the summary, " +
      "the latest 20 history entries and completed cycles of a recurring discussion.",
    annotations: { title: "Get discussion", ...READ },
    schema: z.strictObject({ id: zId("Discussion") }),
    handler: async (a, ctx) => {
      const d = await findDiscussion(ctx, a.id);
      return discussionOut(d, buildParticipantMap(await ctx.participants()), true);
    },
  }),

  defineTool({
    name: "create_discussion",
    description:
      "Create a new discussion (status: new). Only the name is required. " +
      "Participants may be given by id, exact name or alias; `groups` adds every member of those groups. " +
      "A leader is required when there are participants, unless the name starts with פ\"ע/פ\"א (those have no leader). " +
      "The leader must be a non-optional participant or one of the temporary `extraParticipants`. " +
      "dateWindow defaults to 'unspecified'.",
    annotations: { title: "Create discussion", ...WRITE },
    schema: z.strictObject({
      name: zRequiredText("Discussion name (required)"),
      dateWindow: zWindow.optional().describe("Scheduling window (default: unspecified)"),
      participants: zRefs(`Participants. ${REF_HELP}`),
      groups: zRefs("Groups (id or name) whose members are added as participants."),
      optionalParticipants: zRefs(`Participants whose attendance is optional (רשות); they are added as participants. ${REF_HELP}`),
      extraParticipants: zNames("Temporary participants who aren't in the system — free-text names."),
      leader: zText("Leader: a participant (id, name or alias) or one of the extraParticipants names."),
      requiresSummary: zBool("Whether a written summary is required after the discussion (default: true)"),
      requiresSubstrate: zBool("Whether prep material (מצע) is required (default: true)"),
      requiresBashiReview: zBool("Whether בשי must review it before it proceeds (default: false)"),
      recurrence: zRecurrence.optional().describe("How often the discussion repeats (default: none)"),
      durationMinutes: zMinutes("Duration in minutes"),
      notes: zClearableText("Notes / context"),
      important: zBool("Pin as high priority"),
      drivingTimePreference: zBool("Prefer scheduling it during driving time"),
      requestedBy: zRequestedBy,
    }),
    handler: async (a, ctx) => {
      const row = await insertDiscussion(ctx, a, "unspecified");
      return { success: true, discussion: discussionOut(row, buildParticipantMap(await ctx.participants())) };
    },
  }),

  defineTool({
    name: "update_discussion",
    description:
      "Change an existing discussion. Only the fields you pass change; everything is recorded in the history. " +
      "Participants: `participants` replaces the whole list; `addParticipants`, `removeParticipants`, `addGroups` change it " +
      "incrementally. Optional (רשות) people: `optionalParticipants` replaces, `addOptional` / `removeOptional` adjust " +
      "(adding someone as optional also adds them as a participant). " +
      "Status moves follow the app: new → coordinated → waiting_summary (or occurred when no summary is required) → " +
      "distributed, one step back, or cancelled from anywhere; pass force: true for any other move. " +
      "A recurring discussion that reaches its last status is archived as a completed cycle and reopens as new / this_week. " +
      "Setting dateWindow also updates scheduledWeek. Pass null (or \"\") to clear leader, notes, summary or durationMinutes.",
    annotations: { title: "Update discussion", ...WRITE },
    schema: z.strictObject({
      id: zId("Discussion"),
      name: zText("New name"),
      status: zStatus.optional().describe("New status"),
      force: zBool("Allow a status move the app doesn't offer"),
      dateWindow: zWindow.optional().describe("New scheduling window"),
      participants: zRefs(`Replace all participants. ${REF_HELP}`),
      addParticipants: zRefs(`Participants to add. ${REF_HELP}`),
      removeParticipants: zRefs(`Participants to remove. ${REF_HELP}`),
      addGroups: zRefs("Groups (id or name) whose members are added as participants."),
      optionalParticipants: zRefs(`Replace the optional (רשות) participants. ${REF_HELP}`),
      addOptional: zRefs(`Mark as optional (and add as participants if needed). ${REF_HELP}`),
      removeOptional: zRefs(`Unmark as optional (they stay participants). ${REF_HELP}`),
      extraParticipants: zNames("Replace the temporary participants (free-text names). [] clears."),
      leader: zClearableText("New leader: a participant (id, name or alias) or a temporary participant's name. null clears.", 200),
      requiresSummary: zBool("Whether a written summary is required"),
      requiresSubstrate: zBool("Whether prep material (מצע) is required"),
      requiresBashiReview: zBool("Whether בשי must review it"),
      recurrence: zRecurrence.optional().describe("How often the discussion repeats"),
      durationMinutes: zMinutes("Duration in minutes; 0 or null clears"),
      notes: zClearableText("Replace the notes. Use add_note to append instead."),
      summary: zClearableText("Replace the written summary", 20000),
      important: zBool("Mark or unmark as important"),
      drivingTimePreference: zBool("Prefer scheduling it during driving time"),
      requestedBy: zRequestedBy,
    }),
    handler: async (a, ctx) => {
      if (!Object.keys(a).some((k) => !["id", "force", "requestedBy"].includes(k))) {
        throw new ToolError("Nothing to update — pass at least one field besides id.");
      }
      const cur = await findDiscussion(ctx, a.id);
      const problems: string[] = [];
      const patch: AnyRow = {};

      const name = a.name ?? (cur.name as string);
      if (a.name !== undefined) patch.name = a.name;
      if (a.dateWindow !== undefined) {
        patch.date_window = a.dateWindow;
        patch.scheduled_week = scheduledWeekForWindow(a.dateWindow);
      }
      if (a.requiresSummary !== undefined) patch.requires_summary = a.requiresSummary;
      if (a.requiresSubstrate !== undefined) patch.requires_substrate = a.requiresSubstrate;
      if (a.requiresBashiReview !== undefined) patch.requires_bashi_review = a.requiresBashiReview;
      if (a.recurrence !== undefined) patch.recurrence = a.recurrence;
      if (a.durationMinutes !== undefined) patch.duration_minutes = a.durationMinutes || null;
      if (a.notes !== undefined) patch.notes = a.notes || null;
      if (a.summary !== undefined) patch.summary = a.summary || null;
      if (a.important !== undefined) patch.important = a.important;
      if (a.drivingTimePreference !== undefined) patch.driving_time_preference = a.drivingTimePreference;

      const touchesPeople = [
        a.participants, a.addParticipants, a.removeParticipants, a.addGroups,
        a.optionalParticipants, a.addOptional, a.removeOptional, a.extraParticipants, a.leader,
      ].some((v) => v !== undefined) || (a.name !== undefined && isPEDiscussion(a.name) !== isPEDiscussion(cur.name));
      if (touchesPeople) {
        const state = await applyParticipantChanges(
          ctx,
          {
            participant_ids: (cur.participant_ids as string[]) ?? [],
            optional_participant_ids: (cur.optional_participant_ids as string[] | null) ?? [],
            extra_participants: (cur.extra_participants as string[] | null) ?? [],
            leader_id: (cur.leader_id as string | null) ?? null,
          },
          a,
          name
        );
        patch.participant_ids = state.participant_ids;
        patch.optional_participant_ids = state.optional_participant_ids.length ? state.optional_participant_ids : null;
        patch.extra_participants = state.extra_participants.length ? state.extra_participants : null;
        patch.leader_id = state.leader_id;
      }
      // Keep only values that actually change, so the history and "changed" stay accurate.
      for (const key of Object.keys(patch)) {
        if (JSON.stringify(patch[key] ?? null) === JSON.stringify(cur[key] ?? null)) delete patch[key];
      }
      if (!("date_window" in patch)) delete patch.scheduled_week;

      const requiresSummary = (patch.requires_summary ?? cur.requires_summary) as boolean;
      if (a.status !== undefined && a.status !== cur.status && !a.force) {
        const allowed = allowedNextStatuses(cur.status, requiresSummary);
        if (!allowed.includes(a.status)) {
          problems.push(
            `status: can't move from "${cur.status}" (${STATUS_SHORT_LABEL[cur.status]}) to "${a.status}". ` +
              `Allowed: ${allowed.join(", ")}. Pass force: true if this is really intended.`
          );
        }
      }
      failIfAny(problems);

      const pMap = buildParticipantMap(await ctx.participants());
      const events: AnyRow[] = [];
      if ("date_window" in patch && patch.date_window !== cur.date_window) {
        events.push(
          aiEvent(
            ctx,
            "window_changed",
            `מסגרת זמן: ${WINDOW_HISTORY_LABEL[cur.date_window] ?? cur.date_window} ← ${WINDOW_HISTORY_LABEL[patch.date_window] ?? patch.date_window}`,
            a.requestedBy,
            { from: cur.date_window, to: patch.date_window }
          )
        );
      }
      const edits = describeChanges(cur, patch, pMap);
      if (edits.length) events.push(aiEvent(ctx, "edited", edits.join("\n"), a.requestedBy));
      if ("summary" in patch && (patch.summary ?? "") !== (cur.summary ?? "")) {
        events.push(aiEvent(ctx, "summary_changed", patch.summary ? "הסיכום עודכן" : "הסיכום נמחק", a.requestedBy));
      }

      const statusChanges = a.status !== undefined && a.status !== cur.status;
      if (statusChanges) {
        const to = a.status!;
        const statusEvent = aiEvent(
          ctx,
          "status_changed",
          `סטטוס: ${STATUS_SHORT_LABEL[cur.status] ?? cur.status} ← ${STATUS_SHORT_LABEL[to] ?? to}`,
          a.requestedBy,
          { from: cur.status, to }
        );
        const merged = { ...cur, ...patch };
        const closesCycle = merged.recurrence !== "none" && (to === "distributed" || (to === "occurred" && !requiresSummary));
        if (closesCycle) {
          // Same as the app's changeStatus: archive this cycle and open a fresh one.
          const cycles = (cur.cycles as AnyRow[] | null) ?? [];
          const cycleNumber = cycles.length + 1;
          patch.cycles = [
            ...cycles,
            {
              id: randomId("cyc-", 10),
              number: cycleNumber,
              status: to,
              dateWindow: merged.date_window,
              scheduledWeek: merged.scheduled_week ?? undefined,
              summary: merged.summary ?? undefined,
              history: [...((cur.history as AnyRow[]) ?? []), ...events, statusEvent],
              createdAt: cur.created_at,
              closedAt: ctx.now,
            },
          ];
          patch.status = "new";
          patch.date_window = "this_week";
          patch.scheduled_week = scheduledWeekForWindow("this_week");
          patch.summary = null;
          patch.history = [aiEvent(ctx, "created", `מחזור ${cycleNumber + 1} נפתח`, a.requestedBy)];
        } else {
          patch.status = to;
          events.push(statusEvent);
        }
      }

      if (!patch.history && events.length) patch.history = [...((cur.history as AnyRow[]) ?? []), ...events];
      if (!Object.keys(patch).length) {
        return { success: true, changed: false, message: "Nothing changed — every value already matched.", discussion: discussionOut(cur, pMap) };
      }
      patch.updated_at = ctx.now;

      // Only write if nobody changed the discussion since we read it, so history isn't lost.
      const { data, error } = await ctx.db
        .from("discussions")
        .update(patch)
        .eq("id", cur.id)
        .eq("updated_at", cur.updated_at)
        .select("*");
      if (error) throw error;
      if (!data?.length) {
        throw new ToolError("The discussion was changed by someone else at the same moment. Call update_discussion again.");
      }
      return {
        success: true,
        changed: true,
        cycleCompleted: patch.cycles ? true : undefined,
        discussion: discussionOut(data[0] as AnyRow, pMap),
      };
    },
  }),

  defineTool({
    name: "add_note",
    description: "Append a line to a discussion's notes (keeps the existing notes) and record it in the history.",
    annotations: { title: "Add note", ...WRITE },
    schema: z.strictObject({
      id: zId("Discussion"),
      text: zRequiredText("The note to append", 2000),
      requestedBy: zRequestedBy,
    }),
    handler: async (a, ctx) => {
      const cur = await findDiscussion(ctx, a.id);
      const notes = cur.notes ? `${cur.notes}\n${a.text}` : a.text;
      const { data, error } = await ctx.db
        .from("discussions")
        .update({
          notes,
          history: [...((cur.history as AnyRow[]) ?? []), aiEvent(ctx, "note", a.text, a.requestedBy)],
          updated_at: ctx.now,
        })
        .eq("id", cur.id)
        .eq("updated_at", cur.updated_at)
        .select("id,notes");
      if (error) throw error;
      if (!data?.length) throw new ToolError("The discussion was changed by someone else at the same moment. Call add_note again.");
      return { success: true, id: cur.id, notes: (data[0] as AnyRow).notes };
    },
  }),

  defineTool({
    name: "delete_discussion",
    description:
      "Permanently delete a discussion. This cannot be undone — to keep a record, prefer update_discussion " +
      "with status: cancelled.",
    annotations: { title: "Delete discussion", ...DELETE },
    schema: z.strictObject({ id: zId("Discussion") }),
    handler: async (a, ctx) => {
      const d = await findDiscussion(ctx, a.id);
      const { data, error } = await ctx.db.from("discussions").delete().eq("id", d.id).select("id");
      if (error) throw error;
      expectRow(data, `Discussion ${d.id}`);
      return { success: true, deleted: { id: d.id, name: d.name } };
    },
  }),

  // ---- Participants --------------------------------------------------------
  defineTool({
    name: "list_participants",
    description:
      "Return all participants with their id, name, role, unit, phone and aliases. " +
      "Most tools also accept a participant's exact name or alias instead of the id.",
    annotations: { title: "List participants", ...READ },
    schema: z.strictObject({
      query: zText("Only participants whose name, alias, role or unit contains this text."),
    }),
    handler: async (a, ctx) => {
      const text = a.query ? norm(a.query) : null;
      return (await ctx.participants())
        .filter((p) => !text || norm([p.name, ...(p.aliases ?? []), p.role ?? "", p.unit ?? ""].join(" ")).includes(text))
        .map(participantOut);
    },
  }),

  defineTool({
    name: "create_participant",
    description:
      "Add a person to the system so they can be invited to discussions. Refuses if someone already has this " +
      "name or alias (pass allowDuplicateName: true if it really is a different person).",
    annotations: { title: "Create participant", ...WRITE },
    schema: z.strictObject({
      name: zRequiredText("Full name (required)", 100),
      role: zText("Rank and role, e.g. 'אל\"ם · ראש מבצעים'", 200),
      unit: zText("Unit. \"מצפן\" means internal.", 100),
      phone: zText("Phone number", 30),
      aliases: zNames("Other names this person goes by (English name, nickname, email prefix…)"),
      external: zBool("From outside the organisation (default: false)"),
      optional: zBool("Attendance is usually optional (default: false)"),
      allowDuplicateName: zBool("Create even if the name or an alias is already taken"),
    }),
    handler: async (a, ctx) => {
      const people = await ctx.participants();
      const keys = [a.name, ...(a.aliases ?? [])].map(norm);
      const clash = people.filter((p) => PARTICIPANT.keysOf(p).some((k) => keys.includes(norm(k))));
      if (clash.length && !a.allowDuplicateName) {
        throw new ToolError(
          `A participant with this name or alias already exists: ${clash.map(PARTICIPANT.describe).join("; ")}. ` +
            "Use update_participant to change them, or pass allowDuplicateName: true if this is a different person."
        );
      }
      const { data, error } = await ctx.db
        .from("participants")
        .insert({
          id: `p-${Date.now().toString(36)}${randomId("", 6)}`,
          name: a.name,
          role: a.role ?? null,
          unit: a.unit ?? null,
          phone: a.phone ?? null,
          aliases: [...new Set(a.aliases ?? [])],
          external: a.external ?? false,
          optional: a.optional ?? false,
        })
        .select("*")
        .single();
      if (error) throw error;
      return { success: true, participant: participantOut(data as AnyRow) };
    },
  }),

  defineTool({
    name: "update_participant",
    description:
      "Change a participant's details. Only the fields you pass change; pass null to clear role, unit or phone. " +
      "`aliases` replaces the list; `addAliases` / `removeAliases` adjust it.",
    annotations: { title: "Update participant", ...WRITE },
    schema: z.strictObject({
      participant: zId("Participant"),
      name: zText("New name", 100),
      role: zClearableText("Rank and role", 200),
      unit: zClearableText("Unit", 100),
      phone: zClearableText("Phone number", 30),
      aliases: zNames("Replace all aliases. [] clears."),
      addAliases: zNames("Aliases to add"),
      removeAliases: zNames("Aliases to remove"),
      external: zBool("From outside the organisation"),
      optional: zBool("Attendance is usually optional"),
      allowDuplicateName: zBool("Allow a name or alias another participant already has"),
    }),
    handler: async (a, ctx) => {
      const people = await ctx.participants();
      const problems: string[] = [];
      const p = lookup(PARTICIPANT, people, a.participant, "participant", problems);
      failIfAny(problems);

      const patch: AnyRow = {};
      if (a.name !== undefined) patch.name = a.name;
      if (a.role !== undefined) patch.role = a.role || null;
      if (a.unit !== undefined) patch.unit = a.unit || null;
      if (a.phone !== undefined) patch.phone = a.phone || null;
      if (a.external !== undefined) patch.external = a.external;
      if (a.optional !== undefined) patch.optional = a.optional;
      if (a.aliases !== undefined || a.addAliases !== undefined || a.removeAliases !== undefined) {
        const remove = (a.removeAliases ?? []).map(norm);
        const unknown = (a.removeAliases ?? []).filter((r) => !((p!.aliases as string[] | null) ?? []).some((x) => norm(x) === norm(r)));
        if (a.aliases === undefined && unknown.length) {
          problems.push(`removeAliases: ${p!.name} has no alias ${unknown.map((u) => `"${u}"`).join(", ")}. Current aliases: ${(p!.aliases ?? []).join(", ") || "none"}.`);
        }
        const base = a.aliases ?? ((p!.aliases as string[] | null) ?? []);
        patch.aliases = [...new Set([...base, ...(a.addAliases ?? [])])].filter((x) => !remove.includes(norm(x)));
      }
      if (!Object.keys(patch).length) problems.push("Nothing to update — pass at least one field besides participant.");

      const newKeys = [patch.name, ...((patch.aliases as string[] | undefined) ?? [])].filter(Boolean).map(norm);
      const clash = people.filter((o) => o.id !== p!.id && PARTICIPANT.keysOf(o).some((k) => newKeys.includes(norm(k))));
      if (clash.length && !a.allowDuplicateName) {
        problems.push(
          `This name or alias is already used by: ${clash.map(PARTICIPANT.describe).join("; ")}. ` +
            "Pass allowDuplicateName: true if that's intended."
        );
      }
      failIfAny(problems);

      const { data, error } = await ctx.db.from("participants").update(patch).eq("id", p!.id).select("*");
      if (error) throw error;
      return { success: true, participant: participantOut(expectRow(data, `Participant ${p!.id}`) as AnyRow) };
    },
  }),

  defineTool({
    name: "delete_participant",
    description:
      "Remove a participant from the system. Refuses while they're in open discussions or groups and lists them; " +
      "pass removeFromDiscussions: true to take them out of those first (recorded in each discussion's history). " +
      "Closed discussions keep their record.",
    annotations: { title: "Delete participant", ...DELETE },
    schema: z.strictObject({
      participant: zId("Participant"),
      removeFromDiscussions: zBool("Also remove them from open discussions and groups"),
      requestedBy: zRequestedBy,
    }),
    handler: async (a, ctx) => {
      const people = await ctx.participants();
      const problems: string[] = [];
      const p = lookup(PARTICIPANT, people, a.participant, "participant", problems);
      failIfAny(problems);
      const pid = p!.id as string;

      const { data: discussions, error: dErr } = await ctx.db
        .from("discussions")
        .select("id,name,status,participant_ids,optional_participant_ids,leader_id,history,updated_at");
      if (dErr) throw dErr;
      const open = ((discussions ?? []) as AnyRow[]).filter(
        (d) => !CLOSED_STATUSES.has(d.status) && (((d.participant_ids as string[]) ?? []).includes(pid) || d.leader_id === pid)
      );
      const groups = (await ctx.groups()).filter((g) => ((g.participant_ids as string[]) ?? []).includes(pid));

      if ((open.length || groups.length) && !a.removeFromDiscussions) {
        throw new ToolError(
          `${p!.name} is still in ` +
            [
              open.length ? `${open.length} open discussion(s): ${open.map(DISCUSSION.describe).join("; ")}` : "",
              groups.length ? `${groups.length} group(s): ${groups.map(GROUP.describe).join("; ")}` : "",
            ].filter(Boolean).join(" and ") +
            ". Pass removeFromDiscussions: true to remove them from these first, or update those discussions yourself."
        );
      }

      const pMap = buildParticipantMap(people);
      const leaderless: string[] = [];
      for (const d of open) {
        const patch: AnyRow = {
          participant_ids: ((d.participant_ids as string[]) ?? []).filter((x) => x !== pid),
          optional_participant_ids: ((d.optional_participant_ids as string[] | null) ?? []).filter((x) => x !== pid),
        };
        if (!patch.optional_participant_ids.length) patch.optional_participant_ids = null;
        if (d.leader_id === pid) {
          patch.leader_id = null;
          leaderless.push(DISCUSSION.describe(d));
        }
        const edits = describeChanges(d, patch, pMap);
        if (edits.length) {
          patch.history = [...((d.history as AnyRow[]) ?? []), aiEvent(ctx, "edited", edits.join("\n"), a.requestedBy)];
        }
        patch.updated_at = ctx.now;
        const { error } = await ctx.db.from("discussions").update(patch).eq("id", d.id);
        if (error) throw error;
      }
      for (const g of groups) {
        const { error } = await ctx.db
          .from("participant_groups")
          .update({ participant_ids: ((g.participant_ids as string[]) ?? []).filter((x) => x !== pid) })
          .eq("id", g.id);
        if (error) throw error;
      }

      const { data, error } = await ctx.db.from("participants").delete().eq("id", pid).select("id");
      if (error) throw error;
      expectRow(data, `Participant ${pid}`);
      return {
        success: true,
        deleted: { id: pid, name: p!.name },
        removedFromDiscussions: open.map((d) => d.id),
        removedFromGroups: groups.map((g) => g.id),
        discussionsNowWithoutLeader: leaderless.length ? leaderless : undefined,
      };
    },
  }),

  // ---- Groups --------------------------------------------------------------
  defineTool({
    name: "list_groups",
    description: "Return all participant groups with their members. Groups can be added to discussions in one step.",
    annotations: { title: "List groups", ...READ },
    schema: z.strictObject({}),
    handler: async (_a, ctx) => {
      const pMap = buildParticipantMap(await ctx.participants());
      return (await ctx.groups()).map((g) => groupOut(g, pMap));
    },
  }),

  defineTool({
    name: "create_group",
    description: "Create a named group of participants.",
    annotations: { title: "Create group", ...WRITE },
    schema: z.strictObject({
      name: zRequiredText("Group name (required)", 100),
      participants: zRefs(`Members. ${REF_HELP}`),
    }),
    handler: async (a, ctx) => {
      const problems: string[] = [];
      const groups = await ctx.groups();
      const taken = groups.find((g) => norm(g.name) === norm(a.name));
      if (taken) problems.push(`name: a group called "${taken.name}" already exists (${taken.id}). Use update_group to change it.`);
      const people = await ctx.participants();
      const ids = lookupIds(PARTICIPANT, people, a.participants ?? [], "participants", problems);
      failIfAny(problems);

      const { data, error } = await ctx.db
        .from("participant_groups")
        .insert({ id: `grp-${Date.now().toString(36)}${randomId("", 6)}`, name: a.name, participant_ids: ids })
        .select("*")
        .single();
      if (error) throw error;
      return { success: true, group: groupOut(data as AnyRow, buildParticipantMap(people)) };
    },
  }),

  defineTool({
    name: "update_group",
    description:
      "Rename a group or change its members. `participants` replaces the members; " +
      "`addParticipants` / `removeParticipants` adjust them.",
    annotations: { title: "Update group", ...WRITE },
    schema: z.strictObject({
      group: zId("Group"),
      name: zText("New name", 100),
      participants: zRefs(`Replace all members. ${REF_HELP}`),
      addParticipants: zRefs(`Members to add. ${REF_HELP}`),
      removeParticipants: zRefs(`Members to remove. ${REF_HELP}`),
    }),
    handler: async (a, ctx) => {
      const problems: string[] = [];
      const groups = await ctx.groups();
      const g = lookup(GROUP, groups, a.group, "group", problems);
      const people = await ctx.participants();
      const replace = a.participants !== undefined ? lookupIds(PARTICIPANT, people, a.participants, "participants", problems) : undefined;
      const add = lookupIds(PARTICIPANT, people, a.addParticipants ?? [], "addParticipants", problems);
      const remove = lookupIds(PARTICIPANT, people, a.removeParticipants ?? [], "removeParticipants", problems);
      failIfAny(problems);

      const patch: AnyRow = {};
      if (a.name !== undefined) {
        const taken = groups.find((o) => o.id !== g!.id && norm(o.name) === norm(a.name!));
        if (taken) problems.push(`name: another group is already called "${taken.name}" (${taken.id}).`);
        patch.name = a.name;
      }
      if (replace || add.length || remove.length) {
        const base = replace ?? ((g!.participant_ids as string[]) ?? []);
        patch.participant_ids = [...new Set([...base, ...add])].filter((id) => !remove.includes(id));
      }
      if (!Object.keys(patch).length) problems.push("Nothing to update — pass name or a participants change.");
      failIfAny(problems);

      const { data, error } = await ctx.db.from("participant_groups").update(patch).eq("id", g!.id).select("*");
      if (error) throw error;
      return { success: true, group: groupOut(expectRow(data, `Group ${g!.id}`) as AnyRow, buildParticipantMap(people)) };
    },
  }),

  defineTool({
    name: "delete_group",
    description: "Delete a participant group. The participants themselves and discussions are not affected.",
    annotations: { title: "Delete group", ...DELETE },
    schema: z.strictObject({ group: zId("Group") }),
    handler: async (a, ctx) => {
      const problems: string[] = [];
      const g = lookup(GROUP, await ctx.groups(), a.group, "group", problems);
      failIfAny(problems);
      const { data, error } = await ctx.db.from("participant_groups").delete().eq("id", g!.id).select("id");
      if (error) throw error;
      expectRow(data, `Group ${g!.id}`);
      return { success: true, deleted: { id: g!.id, name: g!.name } };
    },
  }),

  // ---- Tasks ---------------------------------------------------------------
  defineTool({
    name: "list_profiles",
    description:
      "Return the app's users (id, name, email). Tasks are assigned to users, not to participants — " +
      "use these for the `responsible` field of create_task / update_task.",
    annotations: { title: "List users", ...READ },
    schema: z.strictObject({}),
    handler: async (_a, ctx) =>
      (await ctx.profiles()).map((u) => ({ id: u.id, name: u.display_name, email: u.email ?? undefined })),
  }),

  defineTool({
    name: "list_tasks",
    description: "Return tasks with their title, description, whether they're done, and the responsible user.",
    annotations: { title: "List tasks", ...READ },
    schema: z.strictObject({
      done: zBool("Only done (true) or open (false) tasks. Default: all."),
    }),
    handler: async (a, ctx) => {
      let q = ctx.db
        .from("tasks")
        .select("id,title,description,responsible_id,done,created_at,updated_at")
        .order("created_at", { ascending: false });
      if (a.done !== undefined) q = q.eq("done", a.done);
      const { data, error } = await q;
      if (error) throw error;
      const profiles = await ctx.profiles();
      return ((data ?? []) as AnyRow[]).map((t) => taskOut(t, profiles));
    },
  }),

  defineTool({
    name: "create_task",
    description: "Create a new task. Only the title is required.",
    annotations: { title: "Create task", ...WRITE },
    schema: z.strictObject({
      title: zRequiredText("Task title (required)"),
      description: zText("Longer description", 5000),
      responsible: zText("Responsible user: id, name or email (see list_profiles). Not a participant.", 200),
    }),
    handler: async (a, ctx) => {
      const problems: string[] = [];
      const profiles = await ctx.profiles();
      const owner = a.responsible ? lookup(PROFILE, profiles, a.responsible, "responsible", problems) : undefined;
      failIfAny(problems);

      const { data, error } = await ctx.db
        .from("tasks")
        .insert({
          id: randomId("task-"),
          title: a.title,
          description: a.description ?? null,
          responsible_id: owner?.id ?? null,
          done: false,
          created_at: ctx.now,
          updated_at: ctx.now,
        })
        .select("*")
        .single();
      if (error) throw error;
      return { success: true, task: taskOut(data as AnyRow, profiles) };
    },
  }),

  defineTool({
    name: "update_task",
    description:
      "Change a task: rename it, edit the description, reassign it, or mark it done / not done. " +
      "Pass null to clear the description or the responsible user.",
    annotations: { title: "Update task", ...WRITE },
    schema: z.strictObject({
      id: zId("Task"),
      title: zText("New title"),
      description: zClearableText("New description; null clears"),
      responsible: zClearableText("Responsible user: id, name or email (see list_profiles); null clears", 200),
      done: zBool("Mark as done (true) or reopen (false)"),
    }),
    handler: async (a, ctx) => {
      const t = await findTask(ctx, a.id);
      const problems: string[] = [];
      const profiles = await ctx.profiles();
      const patch: AnyRow = {};
      if (a.title !== undefined) patch.title = a.title;
      if (a.description !== undefined) patch.description = a.description || null;
      if (a.done !== undefined) patch.done = a.done;
      if (a.responsible !== undefined) {
        patch.responsible_id = a.responsible ? lookup(PROFILE, profiles, a.responsible, "responsible", problems)?.id ?? null : null;
      }
      if (!Object.keys(patch).length) problems.push("Nothing to update — pass at least one field besides id.");
      failIfAny(problems);

      patch.updated_at = ctx.now;
      const { data, error } = await ctx.db.from("tasks").update(patch).eq("id", t.id).select("*");
      if (error) throw error;
      return { success: true, task: taskOut(expectRow(data, `Task ${t.id}`) as AnyRow, profiles) };
    },
  }),

  defineTool({
    name: "complete_task",
    description: "Mark a task as done. (update_task can also reopen or change it.)",
    annotations: { title: "Complete task", ...WRITE, idempotentHint: true },
    schema: z.strictObject({ id: zId("Task") }),
    handler: async (a, ctx) => {
      const t = await findTask(ctx, a.id);
      const { data, error } = await ctx.db
        .from("tasks")
        .update({ done: true, updated_at: ctx.now })
        .eq("id", t.id)
        .select("*");
      if (error) throw error;
      return { success: true, task: taskOut(expectRow(data, `Task ${t.id}`) as AnyRow, await ctx.profiles()) };
    },
  }),

  defineTool({
    name: "delete_task",
    description: "Permanently delete a task. This cannot be undone.",
    annotations: { title: "Delete task", ...DELETE },
    schema: z.strictObject({ id: zId("Task") }),
    handler: async (a, ctx) => {
      const t = await findTask(ctx, a.id);
      const { data, error } = await ctx.db.from("tasks").delete().eq("id", t.id).select("id");
      if (error) throw error;
      expectRow(data, `Task ${t.id}`);
      return { success: true, deleted: { id: t.id, title: t.title } };
    },
  }),

  // ---- Discussion requests -------------------------------------------------
  defineTool({
    name: "list_requests",
    description:
      "Return discussion requests submitted through the public form — by default only pending ones. " +
      "Each item includes the requester, requested title, notes, suggested participants and duration.",
    annotations: { title: "List requests", ...READ },
    schema: z.strictObject({
      status: z.preprocess(listish, z.array(z.enum(["pending", "approved", "rejected"]))).optional()
        .describe("Statuses to include (default: pending)"),
    }),
    handler: async (a, ctx) => {
      const { data, error } = await ctx.db
        .from("discussion_requests")
        .select("id,title,requester_name,notes,participant_ids,duration_minutes,status,created_at,updated_at")
        .in("status", a.status?.length ? a.status : ["pending"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      const pMap = buildParticipantMap(await ctx.participants());
      return ((data ?? []) as AnyRow[]).map((r) => ({
        id: r.id,
        title: r.title,
        requesterName: r.requester_name,
        status: r.status,
        notes: r.notes ?? undefined,
        suggestedParticipants: ((r.participant_ids as string[]) ?? []).map((pid) => resolveParticipant(pid, pMap)),
        durationMinutes: r.duration_minutes ?? undefined,
        createdAt: r.created_at,
      }));
    },
  }),

  defineTool({
    name: "approve_request",
    description:
      "Approve a pending discussion request. Like the app, this creates the discussion from the request " +
      "(title, suggested participants, duration and notes) and then marks the request approved. A leader is " +
      "required when the request has participants (unless it's a פ\"ע/פ\"א). dateWindow defaults to this_week. " +
      "You can adjust the discussion with the same fields as create_discussion. " +
      "Pass createDiscussion: false to only mark the request approved.",
    annotations: { title: "Approve request", ...WRITE },
    schema: z.strictObject({
      id: zId("Request"),
      createDiscussion: zBool("Create the discussion (default: true)"),
      name: zText("Discussion name (default: the request's title)"),
      leader: zText("Leader: a participant (id, name or alias) or one of the extraParticipants names."),
      dateWindow: zWindow.optional().describe("Scheduling window (default: this_week)"),
      addParticipants: zRefs(`Participants to add to the requested ones. ${REF_HELP}`),
      removeParticipants: zRefs(`Requested participants to leave out. ${REF_HELP}`),
      optionalParticipants: zRefs(`Optional (רשות) participants. ${REF_HELP}`),
      extraParticipants: zNames("Temporary participants who aren't in the system — free-text names."),
      requiresSummary: zBool("Whether a written summary is required (default: true)"),
      requiresSubstrate: zBool("Whether prep material (מצע) is required (default: true)"),
      recurrence: zRecurrence.optional().describe("How often the discussion repeats (default: none)"),
      important: zBool("Pin as high priority"),
      requestedBy: zText("Who asked you to approve it (default: the requester's name)", 100),
    }),
    handler: async (a, ctx) => {
      const r = await findRequest(ctx, a.id);
      if (r.status !== "pending") {
        throw new ToolError(`Request ${r.id} ("${r.title}") is already ${r.status}. Only pending requests can be approved.`);
      }

      let discussion: AnyRow | undefined;
      const warnings: string[] = [];
      if (a.createDiscussion !== false) {
        const name = a.name ?? (r.title as string);
        // People may have been deleted since the request was submitted.
        const people = await ctx.participants();
        const requested = (r.participant_ids as string[]) ?? [];
        const missing = requested.filter((pid) => !people.some((p) => p.id === pid));
        if (missing.length) warnings.push(`Requested participants no longer in the system were left out: ${missing.join(", ")}`);
        discussion = await insertDiscussion(
          ctx,
          {
            ...a,
            name,
            participants: requested.filter((pid) => !missing.includes(pid)),
            durationMinutes: r.duration_minutes,
            notes: r.notes,
            requestedBy: a.requestedBy ?? (r.requester_name as string),
          },
          "this_week"
        );
      }

      const { data, error } = await ctx.db
        .from("discussion_requests")
        .update({ status: "approved", updated_at: ctx.now })
        .eq("id", r.id)
        .eq("status", "pending")
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new ToolError(
          `Request ${r.id} was handled by someone else meanwhile.` +
            (discussion ? ` Discussion ${discussion.id} was already created — delete it if it's a duplicate.` : "")
        );
      }
      return {
        success: true,
        request: { id: r.id, status: "approved" },
        discussion: discussion ? discussionOut(discussion, buildParticipantMap(await ctx.participants())) : undefined,
        warnings: warnings.length ? warnings : undefined,
      };
    },
  }),

  defineTool({
    name: "reject_request",
    description: "Reject a pending discussion request.",
    annotations: { title: "Reject request", ...WRITE, idempotentHint: true },
    schema: z.strictObject({ id: zId("Request") }),
    handler: async (a, ctx) => {
      const r = await findRequest(ctx, a.id);
      if (r.status !== "pending") {
        throw new ToolError(`Request ${r.id} ("${r.title}") is already ${r.status}. Only pending requests can be rejected.`);
      }
      const { data, error } = await ctx.db
        .from("discussion_requests")
        .update({ status: "rejected", updated_at: ctx.now })
        .eq("id", r.id)
        .select("id");
      if (error) throw error;
      expectRow(data, `Request ${r.id}`);
      return { success: true, request: { id: r.id, title: r.title, status: "rejected" } };
    },
  }),
];

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

const TOOL_LIST = TOOLS.map((t) => {
  const { $schema: _schema, ...inputSchema } = z.toJSONSchema(t.schema) as AnyRow;
  return { name: t.name, title: t.annotations.title, description: t.description, inputSchema, annotations: t.annotations };
});

// ---------------------------------------------------------------------------
// Validation messages
// ---------------------------------------------------------------------------

function closestKey(key: string, known: string[]): string | undefined {
  const k = key.toLowerCase();
  let best: { key: string; d: number } | undefined;
  for (const candidate of known) {
    const c = candidate.toLowerCase();
    const d = c.startsWith(k) || k.startsWith(c) ? 1 : editDistance(k, c);
    if (d <= 3 && (!best || d < best.d)) best = { key: candidate, d };
  }
  return best?.key;
}

function formatIssues(issues: z.ZodError["issues"], known: string[]): string[] {
  return issues.flatMap((issue) => {
    const path = issue.path
      .map((p, i) => (typeof p === "number" ? `[${p}]` : `${i ? "." : ""}${String(p)}`))
      .join("");
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => {
        const hint = closestKey(key, known);
        return `${path ? `${path}.` : ""}${key}: unknown argument.${hint ? ` Did you mean "${hint}"?` : ""} ` +
          `Valid arguments: ${known.join(", ")}.`;
      });
    }
    if (issue.code === "invalid_type" && issue.message.endsWith("received undefined")) {
      return [`${path || "arguments"}: required.`];
    }
    return [`${path || "arguments"}: ${issue.message}.`];
  });
}

/** Renames old argument names (participantIds → participants …) the tool no longer uses. */
function renameLegacyKeys(args: unknown, known: string[]): unknown {
  if (!args || typeof args !== "object" || Array.isArray(args)) return args;
  const out: AnyRow = { ...(args as AnyRow) };
  for (const [oldKey, newKey] of Object.entries(LEGACY_KEYS)) {
    if (oldKey in out && !(newKey in out) && known.includes(newKey) && !known.includes(oldKey)) {
      out[newKey] = out[oldKey];
      delete out[oldKey];
    }
  }
  return out;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const o = e as AnyRow;
    return [o.message, o.details, o.hint].filter(Boolean).join(" | ") || JSON.stringify(e);
  }
  return String(e);
}

function toolResult(data: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function toolError(text: string) {
  return { isError: true, content: [{ type: "text", text }] };
}

async function callTool(name: string, rawArgs: unknown, ctx: Ctx) {
  const tool = TOOL_BY_NAME.get(name)!;
  const known = Object.keys(tool.schema.shape);
  const parsed = tool.schema.safeParse(renameLegacyKeys(rawArgs ?? {}, known));
  if (!parsed.success) {
    const lines = formatIssues(parsed.error.issues, known).map((l) => `- ${l}`);
    return toolError(`Invalid arguments for ${name}. Nothing was changed.\n${lines.join("\n")}\nFix these and call ${name} again.`);
  }
  try {
    return toolResult(await tool.handler(parsed.data, ctx));
  } catch (e) {
    if (e instanceof ToolError) {
      const lines = e.message.split("\n").map((l) => `- ${l}`);
      return toolError(`${name} could not run. Nothing was changed.\n${lines.join("\n")}`);
    }
    console.error(`[mcp] ${name} failed`, e);
    return toolError(`${name} failed with a server error: ${errorMessage(e)}`);
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

const SERVER_INSTRUCTIONS =
  "Mazpen tracks command discussions (דיונים), their participants, tasks and discussion requests. " +
  "Wherever a tool asks for a participant, user, group, discussion, task or request you may pass its id or its " +
  "exact name (participants also by alias). If a name is ambiguous or unknown the tool returns an error listing " +
  "the candidates — pick one and call again. Always pass requestedBy with the name of the person who asked you " +
  "to make a change. When you mention a discussion, include its url.";

/** Constant-time string comparison so the API key can't be guessed by timing. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // --- Auth ---
  // Fail closed: if MCP_API_KEY is missing, nobody gets in.
  const apiKey = Deno.env.get("MCP_API_KEY");
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!apiKey || !timingSafeEqual(token, apiKey)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  // No server-initiated SSE stream; clients fall back to plain POST.
  if (req.method !== "POST") {
    return new Response(null, { status: 405, headers: { ...corsHeaders, Allow: "POST, OPTIONS" } });
  }

  // --- Parse request ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }),
      { status: 400, headers: jsonHeaders }
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.method !== "string") {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid Request: expected one JSON-RPC object with a method" }, id: null }),
      { status: 400, headers: jsonHeaders }
    );
  }

  const { method, params, id } = body as { method: string; params?: AnyRow; id?: unknown };

  function ok(result: unknown) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", result, id }), { headers: jsonHeaders });
  }

  function rpcError(code: number, message: string) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id }), { headers: jsonHeaders });
  }

  // --- MCP lifecycle ---

  if (method.startsWith("notifications/") || id === undefined) {
    return new Response(null, { status: 202, headers: corsHeaders });
  }

  if (method === "initialize") {
    const requested = params?.protocolVersion as string | undefined;
    return ok({
      protocolVersion:
        requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : DEFAULT_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "mazpen-mcp", version: "2.0.0" },
      instructions: SERVER_INSTRUCTIONS,
    });
  }

  if (method === "ping") {
    return ok({});
  }

  if (method === "tools/list") {
    return ok({ tools: TOOL_LIST });
  }

  // --- Tool calls ---

  if (method === "tools/call") {
    const toolName = (params?.name as string) ?? "";
    if (!TOOL_BY_NAME.has(toolName)) {
      return rpcError(-32602, `Unknown tool: ${toolName}. Available tools: ${TOOLS.map((t) => t.name).join(", ")}`);
    }
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    return ok(await callTool(toolName, params?.arguments, makeCtx(db)));
  }

  return rpcError(-32601, `Method not found: ${method}`);
});
