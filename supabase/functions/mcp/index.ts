/**
 * Mazpen MCP Server — Supabase Edge Function
 *
 * Implements the Model Context Protocol (Streamable HTTP transport, JSON-RPC 2.0).
 * Exposes read-only views of active discussions, pending requests, and tasks,
 * plus a single write operation: create_task.
 *
 * Authentication: Bearer token matched against the MCP_API_KEY secret.
 * If MCP_API_KEY is not set the endpoint is open (useful during dev).
 *
 * Deploy:
 *   supabase functions deploy mcp
 *   supabase secrets set MCP_API_KEY=<your-secret-key>
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// CORS / common headers
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

// ---------------------------------------------------------------------------
// Hebrew window labels — handy context for the AI agent
// ---------------------------------------------------------------------------

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

const VALID_STATUSES = new Set(Object.keys(STATUS_LABEL));
const VALID_DATE_WINDOWS = new Set(["this_week", "next_week", "later", "in_a_month", "unspecified"]);

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

// ---------------------------------------------------------------------------
// Tool definitions (returned by tools/list)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "list_discussions",
    description:
      "Return all active discussions that are either in planning (new) or coordinated (coordinated). " +
      "Each item includes the discussion name, scheduling window, participants with their roles, " +
      "the designated leader, duration, notes, and whether it is marked as important. " +
      "Discussions that have already occurred, been distributed, or were cancelled are excluded.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_requests",
    description:
      "Return all pending discussion requests that have not yet been approved or rejected. " +
      "Each item includes the requester name, requested title, notes, suggested participants, " +
      "and the requested duration in minutes.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_tasks",
    description:
      "Return all tasks regardless of completion status. " +
      "Each item includes the title, description, whether it is done, " +
      "and the responsible person (name + id) if one is assigned.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "complete_task",
    description: "Mark a task as done. Use list_tasks to get the task id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task ID (required)" },
      },
      required: ["id"],
    },
  },
  {
    name: "update_discussion",
    description:
      "Update one or more fields of an existing discussion. Only the fields you provide are changed. " +
      "Use list_discussions to get discussion IDs. " +
      "Allowed status transitions: new → coordinated → occurred/waiting_summary → distributed. " +
      "Setting dateWindow also updates the scheduledWeek automatically.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Discussion ID (required)" },
        name: { type: "string", description: "New name for the discussion" },
        status: {
          type: "string",
          enum: ["new", "coordinated", "occurred", "waiting_summary", "waiting_approval", "distributed", "cancelled"],
          description: "New status",
        },
        dateWindow: {
          type: "string",
          enum: ["this_week", "next_week", "later", "in_a_month", "unspecified"],
          description: "New scheduling window",
        },
        notes: { type: "string", description: "Replace the notes field. Pass empty string to clear." },
        leaderId: { type: "string", description: "Participant ID of the new leader. Pass empty string to clear." },
        durationMinutes: { type: "number", description: "Meeting duration in minutes. Pass 0 to clear." },
        important: { type: "boolean", description: "Mark or unmark as important" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_discussion",
    description:
      "Permanently delete a discussion by ID. Use list_discussions to get the ID. " +
      "This action cannot be undone.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Discussion ID (required)" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_discussion",
    description:
      "Create a new discussion. Only the name is required. " +
      "participantIds must be valid participant IDs from list_discussions. " +
      "If participants are provided and the discussion is not a פ\"ע/פ\"א type, a leaderId is required. " +
      "dateWindow defaults to 'unspecified' if not provided.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Discussion name (required)" },
        dateWindow: {
          type: "string",
          enum: ["this_week", "next_week", "later", "in_a_month", "unspecified"],
          description: "Scheduling window (default: unspecified)",
        },
        participantIds: {
          type: "array",
          items: { type: "string" },
          description: "List of participant IDs",
        },
        leaderId: { type: "string", description: "Participant ID of the leader (required if participants provided, unless פ\"ע/פ\"א)" },
        requiresSummary: { type: "boolean", description: "Whether a written summary is required after the discussion (default: true)" },
        requiresSubstrate: { type: "boolean", description: "Whether prep material (מצע) is required (default: true)" },
        recurrence: {
          type: "string",
          enum: ["none", "twice_weekly", "thrice_weekly", "weekly", "biweekly", "triweekly", "monthly"],
          description: "How often the discussion repeats (default: none)",
        },
        durationMinutes: { type: "number", description: "Duration in minutes" },
        notes: { type: "string", description: "Notes / context" },
        important: { type: "boolean", description: "Pin as high priority" },
      },
      required: ["name"],
    },
  },
  {
    name: "create_task",
    description:
      "Create a new task. Only the title is required. " +
      "To assign a responsible person use their participant id from list_tasks or list_discussions.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title (required)" },
        description: { type: "string", description: "Optional longer description" },
        responsibleId: {
          type: "string",
          description: "Participant id of the person responsible for this task (optional)",
        },
      },
      required: ["title"],
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

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
        aliases: (p.aliases as string[] | null) ?? undefined,
      }
    : { id, name: "Unknown" };
}

function textContent(data: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // --- Auth ---
  const apiKey = Deno.env.get("MCP_API_KEY");
  if (apiKey) {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (token !== apiKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }
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

  const { method, params, id } = body as { method: string; params?: AnyRow; id?: unknown };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  function ok(result: unknown) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", result, id }), { headers: jsonHeaders });
  }

  function rpcError(code: number, message: string, status = 400) {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id }),
      { status, headers: jsonHeaders }
    );
  }

  // --- MCP lifecycle ---

  if (method === "initialize") {
    return ok({
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "mazpen-mcp", version: "1.0.0" },
    });
  }

  if (method === "notifications/initialized") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (method === "tools/list") {
    return ok({ tools: TOOLS });
  }

  // --- Tool calls ---

  if (method === "tools/call") {
    const toolName = (params?.name as string) ?? "";
    const args = (params?.arguments ?? {}) as AnyRow;

    try {
      // ---- list_discussions ------------------------------------------------
      if (toolName === "list_discussions") {
        const [{ data: discussions, error: dErr }, { data: participants }] = await Promise.all([
          supabase
            .from("discussions")
            .select(
              "id,name,status,date_window,scheduled_week,participant_ids,extra_participants,optional_participant_ids,leader_id,requires_summary,requires_substrate,recurrence,duration_minutes,notes,important,driving_time_preference,created_at,updated_at"
            )
            .in("status", ["new", "coordinated"])
            .order("created_at", { ascending: false }),
          supabase.from("participants").select("id,name,role,unit,phone,aliases"),
        ]);

        if (dErr) throw dErr;

        const pMap = buildParticipantMap(participants ?? []);

        const result = (discussions ?? []).map((d: AnyRow) => ({
          id: d.id,
          name: d.name,
          status: d.status,
          statusLabel: STATUS_LABEL[d.status as string] ?? d.status,
          dateWindow: d.date_window,
          dateWindowLabel: DATE_WINDOW_LABEL[d.date_window as string] ?? d.date_window,
          scheduledWeek: d.scheduled_week ?? undefined,
          participants: ((d.participant_ids as string[]) ?? []).map((pid) =>
            resolveParticipant(pid, pMap)
          ),
          extraParticipants: (d.extra_participants as string[] | null) ?? undefined,
          optionalParticipantIds: (d.optional_participant_ids as string[] | null) ?? undefined,
          leader: d.leader_id ? resolveParticipant(d.leader_id as string, pMap) : undefined,
          requiresSummary: d.requires_summary,
          requiresSubstrate: d.requires_substrate,
          recurrence: d.recurrence,
          durationMinutes: d.duration_minutes ?? undefined,
          notes: d.notes ?? undefined,
          important: d.important ?? false,
          drivingTimePreference: d.driving_time_preference ?? false,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        }));

        return ok(textContent(result));
      }

      // ---- list_requests ---------------------------------------------------
      if (toolName === "list_requests") {
        const [{ data: requests, error: rErr }, { data: participants }] = await Promise.all([
          supabase
            .from("discussion_requests")
            .select(
              "id,title,requester_name,notes,participant_ids,duration_minutes,status,created_at,updated_at"
            )
            .eq("status", "pending")
            .order("created_at", { ascending: false }),
          supabase.from("participants").select("id,name,role,phone,aliases"),
        ]);

        if (rErr) throw rErr;

        const pMap = buildParticipantMap(participants ?? []);

        const result = (requests ?? []).map((r: AnyRow) => ({
          id: r.id,
          title: r.title,
          requesterName: r.requester_name,
          notes: r.notes ?? undefined,
          suggestedParticipants: ((r.participant_ids as string[]) ?? []).map((pid) =>
            resolveParticipant(pid, pMap)
          ),
          durationMinutes: r.duration_minutes ?? undefined,
          createdAt: r.created_at,
        }));

        return ok(textContent(result));
      }

      // ---- list_tasks ------------------------------------------------------
      if (toolName === "list_tasks") {
        const [{ data: tasks, error: tErr }, { data: participants }] = await Promise.all([
          supabase
            .from("tasks")
            .select("id,title,description,responsible_id,done,created_at,updated_at")
            .order("created_at", { ascending: false }),
          supabase.from("participants").select("id,name,phone,aliases"),
        ]);

        if (tErr) throw tErr;

        const pMap = buildParticipantMap(participants ?? []);

        const result = (tasks ?? []).map((t: AnyRow) => ({
          id: t.id,
          title: t.title,
          description: (t.description as string | null) ?? undefined,
          done: t.done,
          responsible: t.responsible_id
            ? resolveParticipant(t.responsible_id as string, pMap)
            : undefined,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
        }));

        return ok(textContent(result));
      }

      // ---- update_discussion -----------------------------------------------
      if (toolName === "update_discussion") {
        const discussionId = typeof args.id === "string" ? args.id.trim() : "";
        if (!discussionId) return rpcError(-32602, "id is required");

        // Validate enum fields if provided
        if (args.status !== undefined && !VALID_STATUSES.has(args.status as string)) {
          return rpcError(-32602, `Invalid status: ${args.status}`);
        }
        if (args.dateWindow !== undefined && !VALID_DATE_WINDOWS.has(args.dateWindow as string)) {
          return rpcError(-32602, `Invalid dateWindow: ${args.dateWindow}`);
        }

        // Build the patch — only include explicitly provided fields
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const patch: Record<string, any> = { updated_at: new Date().toISOString() };

        if (typeof args.name === "string" && args.name.trim()) patch.name = args.name.trim();
        if (typeof args.status === "string") patch.status = args.status;
        if (typeof args.dateWindow === "string") {
          patch.date_window = args.dateWindow;
          patch.scheduled_week = scheduledWeekForWindow(args.dateWindow);
        }
        if (typeof args.notes === "string") patch.notes = args.notes.trim() || null;
        if (typeof args.leaderId === "string") patch.leader_id = args.leaderId.trim() || null;
        if (typeof args.durationMinutes === "number") patch.duration_minutes = args.durationMinutes > 0 ? args.durationMinutes : null;
        if (typeof args.important === "boolean") patch.important = args.important;

        if (Object.keys(patch).length === 1) {
          return rpcError(-32602, "No fields to update — provide at least one field besides id");
        }

        const { error: uErr } = await supabase
          .from("discussions")
          .update(patch)
          .eq("id", discussionId);

        if (uErr) throw uErr;

        return ok(textContent({ success: true, id: discussionId, updated: patch }));
      }

      // ---- delete_discussion -----------------------------------------------
      if (toolName === "delete_discussion") {
        const discussionId = typeof args.id === "string" ? args.id.trim() : "";
        if (!discussionId) return rpcError(-32602, "id is required");

        const { error: dErr } = await supabase
          .from("discussions")
          .delete()
          .eq("id", discussionId);

        if (dErr) throw dErr;

        return ok(textContent({ success: true, id: discussionId }));
      }

      // ---- create_discussion -----------------------------------------------
      if (toolName === "create_discussion") {
        const name = typeof args.name === "string" ? args.name.trim() : "";
        if (!name) return rpcError(-32602, "name is required and must be a non-empty string");

        const dateWindow = (typeof args.dateWindow === "string" && VALID_DATE_WINDOWS.has(args.dateWindow))
          ? args.dateWindow
          : "unspecified";

        const participantIds: string[] = Array.isArray(args.participantIds) ? args.participantIds : [];
        const leaderId = typeof args.leaderId === "string" && args.leaderId.trim() ? args.leaderId.trim() : null;

        // Detect פ"ע / פ"א — same heuristic as the app
        const isPE = /פ[""']?[עא]/.test(name);

        if (!isPE && participantIds.length > 0 && !leaderId) {
          return rpcError(-32602, "leaderId is required when participants are provided (unless פ\"ע/פ\"א)");
        }
        if (leaderId && participantIds.length > 0 && !participantIds.includes(leaderId)) {
          return rpcError(-32602, "leaderId must be one of the participantIds");
        }

        const scheduledWeek = scheduledWeekForWindow(dateWindow);
        const now = new Date().toISOString();
        const newId = `disc-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
        const histId = `h-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

        const row = {
          id: newId,
          name,
          status: "new",
          date_window: dateWindow,
          scheduled_week: scheduledWeek,
          participant_ids: participantIds,
          extra_participants: null,
          optional_participant_ids: null,
          leader_id: isPE ? null : leaderId,
          requires_summary: typeof args.requiresSummary === "boolean" ? args.requiresSummary : true,
          requires_substrate: typeof args.requiresSubstrate === "boolean" ? args.requiresSubstrate : true,
          requires_bashi_review: false,
          recurrence: typeof args.recurrence === "string" ? args.recurrence : "none",
          duration_minutes: typeof args.durationMinutes === "number" && args.durationMinutes > 0 ? args.durationMinutes : null,
          notes: typeof args.notes === "string" && args.notes.trim() ? args.notes.trim() : null,
          summary: null,
          driving_time_preference: false,
          important: typeof args.important === "boolean" ? args.important : false,
          cycles: [],
          history: [{ id: histId, kind: "created", at: now, text: "הדיון נוצר על ידי סוכן AI" }],
          created_at: now,
          updated_at: now,
        };

        const { error: iErr } = await supabase.from("discussions").insert(row);
        if (iErr) throw iErr;

        return ok(textContent({ success: true, id: newId, name, status: "new", dateWindow }));
      }

      // ---- create_task -----------------------------------------------------
      if (toolName === "create_task") {
        const title = typeof args.title === "string" ? args.title.trim() : "";
        if (!title) return rpcError(-32602, "title is required and must be a non-empty string");

        const description =
          typeof args.description === "string" && args.description.trim()
            ? args.description.trim()
            : null;
        const responsibleId =
          typeof args.responsibleId === "string" && args.responsibleId.trim()
            ? args.responsibleId.trim()
            : null;

        const now = new Date().toISOString();
        const newId = `task-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

        const { data, error: iErr } = await supabase
          .from("tasks")
          .insert({
            id: newId,
            title,
            description,
            responsible_id: responsibleId,
            done: false,
            created_at: now,
            updated_at: now,
          })
          .select("id,title,description,responsible_id,done,created_at")
          .single();

        if (iErr) throw iErr;

        return ok(
          textContent({
            success: true,
            task: {
              id: (data as AnyRow).id,
              title: (data as AnyRow).title,
              description: ((data as AnyRow).description as string | null) ?? undefined,
              done: (data as AnyRow).done,
              createdAt: (data as AnyRow).created_at,
            },
          })
        );
      }

      // ---- complete_task ---------------------------------------------------
      if (toolName === "complete_task") {
        const taskId = typeof args.id === "string" ? args.id.trim() : "";
        if (!taskId) return rpcError(-32602, "id is required");

        const { error: uErr } = await supabase
          .from("tasks")
          .update({ done: true, updated_at: new Date().toISOString() })
          .eq("id", taskId);

        if (uErr) throw uErr;

        return ok(textContent({ success: true, id: taskId, done: true }));
      }

      return rpcError(-32601, `Unknown tool: ${toolName}`);
    } catch (e) {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: String(e) }, id }),
        { status: 500, headers: jsonHeaders }
      );
    }
  }

  return rpcError(-32601, `Method not found: ${method}`);
});
