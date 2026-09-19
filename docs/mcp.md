# MCP server

Gateling Meetings speaks the [Model Context Protocol](https://modelcontextprotocol.io),
so an AI agent — Claude Code, Cursor, Claude Desktop, your own — can create
meetings, mint join links and read these docs with the same integration key
the REST API takes. Every tool calls the same code as its `/api/v1` route,
so anything the API allows the agent can do, and nothing more.

```
Endpoint   https://meetings.gateling.com/api/mcp
Transport  Streamable HTTP (stateless — no session to keep)
Auth       Authorization: Bearer gm_live_…   (an integration key, see integration.md)
```

The key is the whole story: no key, or a revoked one, is `401`; a key whose
organization is not on a plan with API access is `403`; the same rate limits
as the REST API apply. There is no anonymous mode.

## Connect a client

**Claude Code**

```bash
claude mcp add --transport http gateling-meetings https://meetings.gateling.com/api/mcp --header "Authorization: Bearer gm_live_…"
```

**Cursor** — `.cursor/mcp.json` (or the global one):

```json
{
  "mcpServers": {
    "gateling-meetings": {
      "url": "https://meetings.gateling.com/api/mcp",
      "headers": { "Authorization": "Bearer gm_live_…" }
    }
  }
}
```

**Claude Desktop** — Settings → Connectors → *Add custom connector* with the
URL above; when asked for a header, add `Authorization: Bearer gm_live_…`.
Clients that can only do OAuth (no custom headers) cannot connect yet.

Keep the key out of shared config: it is a server credential, and a client
that holds it can do everything the key can.

## Tools

| Tool | Does | REST twin |
|---|---|---|
| `get_docs` | Returns one section of these docs (`integration`, `webhooks`, `mcp`) as markdown. | — |
| `list_meetings` | This integration's meetings, newest first; filter by `status` or `externalRef`. | `GET /api/v1/meetings` |
| `get_meeting` | One meeting by code. | `GET /api/v1/meetings/:code` |
| `create_meeting` | Instant (no `scheduledAt`) or scheduled; the host is one of your users, created on first sight. | `POST /api/v1/meetings` |
| `update_meeting` | Title, time, passcode (`""` removes it), settings, `externalRef`. | `PATCH /api/v1/meetings/:code` |
| `end_meeting` | Ends it for everyone. | `POST /api/v1/meetings/:code/end` |
| `delete_meeting` | Soft-deletes; the link stops resolving. | `DELETE /api/v1/meetings/:code` |
| `create_join_link` | A signed, short-lived `/sso/join` URL for one of your users, as `host` or `participant`. | `POST /api/v1/meetings/:code/join-links` |
| `list_participants` | The attendance log, one row per connection. | `GET /api/v1/meetings/:code/participants` |

Inputs and outputs are the JSON bodies documented in [integration.md](integration.md);
dates are ISO 8601 with an offset. A failed call comes back as a tool error
carrying the REST error envelope (`{ "error": { "code", "message", "details" } }`),
so the agent can read `not_found`, `validation_error`, `precondition_failed`
and act on it.

The docs are also exposed as resources: `docs://integration`,
`docs://webhooks`, `docs://mcp`.

## What it is not

- Not a per-person login. The agent acts *as the integration*, for meetings
  the integration created. To act for a signed-in person inside the app, use
  the in-app companion instead.
- Not a webhook replacement. To hear when a meeting starts or ends, set a
  webhook URL on the integration ([webhooks.md](webhooks.md)).
