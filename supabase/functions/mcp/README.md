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

## Tools

| Tool | Type | Description |
|------|------|-------------|
| `list_discussions` | read | Active discussions (status: new / coordinated) |
| `list_requests` | read | Pending discussion requests |
| `list_tasks` | read | All tasks |
| `create_task` | write | Create a new task |

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
