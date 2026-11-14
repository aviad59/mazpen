# Mazpen MCP Server

Supabase Edge Function that exposes Mazpen data via the Model Context Protocol
(JSON-RPC 2.0, Streamable HTTP transport).

## Endpoint

```
POST https://<project-ref>.supabase.co/functions/v1/mcp
```

## Authentication

```
Authorization: Bearer <MCP_API_KEY>
```

Set the key:
```bash
supabase secrets set MCP_API_KEY=<your-secret>
```

Optional: `APP_URL` (e.g. `https://mazpen.example`) adds a share `url` to every discussion.

## Tools

| Tool | Type | Description |
|------|------|-------------|
| `list_discussions` | read | Discussions — active (new / coordinated) by default; filter by status, window, participant, text, important |
| `get_discussion` | read | One discussion in any status, with summary, latest history and completed cycles |
| `create_discussion` | write | New discussion with participants, groups, optional / temporary participants, leader and flags |
| `update_discussion` | write | Change any field; add / remove participants; status moves (recurring discussions open a new cycle) |
| `add_note` | write | Append a line to the notes |
| `delete_discussion` | delete | Permanently delete a discussion |
| `list_participants` | read | All participants, optionally filtered by text |
| `create_participant` | write | Add a person (refuses duplicate names / aliases) |
| `update_participant` | write | Change details and aliases |
| `delete_participant` | delete | Remove a person; with `removeFromDiscussions` also takes them out of open discussions and groups |
| `list_groups` / `create_group` / `update_group` / `delete_group` | read / write / delete | Participant groups |
| `list_profiles` | read | App users — tasks are assigned to these, not to participants |
| `list_tasks` / `create_task` / `update_task` / `complete_task` / `delete_task` | read / write / delete | Tasks |
| `list_requests` | read | Discussion requests (pending by default) |
| `approve_request` | write | Creates the discussion from the request, then marks it approved (like the app) |
| `reject_request` | write | Reject a pending request |

Every change to a discussion is written to its history as "סוכן AI", with the
`requestedBy` name when given, using the same wording as the app.

## Referring to things by name

Anywhere a tool takes a participant, user, group, discussion, task or request you
can pass its **id or its exact name** (participants also by alias). Matching ignores
case, extra spaces and Hebrew quote marks (`רמ"ח` = `רמ״ח` = `רמח`). Partial names
are never guessed: an ambiguous or unknown name is an error that lists the candidates
or the closest names, so the agent can pick one and retry.

## Errors

| Situation | Response |
|-----------|----------|
| Bad arguments (wrong type, bad enum, unknown argument, empty name…) | Tool result with `isError: true` listing **every** problem with its path, e.g. `participants[1]: "דני" matches 2 participants: …`. Unknown arguments get a "did you mean" hint. Nothing is changed. |
| Rule violations (missing leader, unknown id, disallowed status move, duplicate name, stale write…) | Tool result with `isError: true` explaining what to do instead. Nothing is changed. |
| Database / unexpected errors | Tool result with `isError: true` and the server error text. |
| Unknown tool / method | JSON-RPC error (`-32602` / `-32601`). |
| Missing or wrong API key | HTTP 401. Malformed JSON: HTTP 400. |

Common model slips are accepted rather than rejected: `"45"` for 45, `"true"` for true,
a single string where a list is expected, and the old argument names `participantIds`,
`leaderId` and `responsibleId`.

## Claude Desktop config example

```json
{
  "mcpServers": {
    "mazpen": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://<project-ref>.supabase.co/functions/v1/mcp"],
      "env": {
        "MCP_AUTH_HEADER": "Bearer <MCP_API_KEY>"
      }
    }
  }
}
```

Or with any MCP client that supports Streamable HTTP — point it at the URL
with `Authorization: Bearer <key>` and call `initialize` first.

## Deploy

```bash
supabase functions deploy mcp
supabase secrets set MCP_API_KEY=<choose-a-strong-random-key>
```

Pushing changes under `supabase/functions/` to `main` deploys automatically
(`.github/workflows/deploy-supabase-functions.yml`).
