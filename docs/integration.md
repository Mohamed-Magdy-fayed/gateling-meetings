# Integrating another system

How atelier, TMS, gateling.com — any Next.js app with its own users — creates
meetings here and sends its already-signed-in people into a room **without a
second login**, then hears back what happened.

The shape is a plain **redirect flow**: your backend calls this API with an API
key, gets a signed link, and redirects the browser to it. The meeting itself
runs on `https://meetings.gateling.com`; nothing is embedded, and the only
secret that ever leaves this app is the API key.

```
your server ──POST /api/v1/meetings────────────▶ meetings.gateling.com
your server ──POST …/join-links (role: host)───▶  { url: https://…/sso/join?token=… }
your server ──302 → that url──────────────────▶ browser lands in the room as host
meetings ────POST <your webhook> ──────────────▶ meeting.started / participant.joined / … / meeting.ended
```

An AI agent holding the same key can do all of this over MCP — see
[mcp.md](mcp.md).

## 1. Create the integration (once)

API access is part of the **Business** plan. An owner or admin of an
organization on Business opens `https://meetings.gateling.com/settings/integrations`
and clicks **New integration**. (Platform admins — `ADMIN_EMAILS` — see every
integration there and can additionally tick *Platform integration*, which
belongs to no organization and is never capped; that is for Gateling's own
systems.)

Every meeting the key creates runs under the owning organization's plan:
participant cap, meeting length and so on apply exactly as they do in the
browser. If the plan lapses, the key answers `403 forbidden` until the
organization is back on a plan with API access — it is not revoked.

| Field | What to put |
|---|---|
| Name | Shown to people as "Back to *Name*" after a meeting. |
| Slug | Stable id, e.g. `atelier`. Becomes the token audience. |
| Webhook URL | Where to POST events (`https://…/api/meetings-webhook`). Optional. |
| Allowed return origins | `https://atelier.gateling.com` — a `returnUrl` must be on one of these. |

Copy the **API key** (`gm_live_…`) and the **webhook secret** (`whsec_…`) into
the other system's environment. They are shown once; **Rotate key** issues a
fresh pair.

```
MEETINGS_API_URL=https://meetings.gateling.com
MEETINGS_API_KEY=gm_live_…
MEETINGS_WEBHOOK_SECRET=whsec_…
```

## 2. Install the client

The consumer side lives in the Gateling registry as one installable block —
the typed client for this API, create-or-reschedule / cancel / join-link
helpers, a signed-webhook receiver, and its tests. Add the namespace to the
other repo's `components.json` once, then install:

```json
{ "registries": { "@gateling": "https://gateling-registry.vercel.app/r/{name}.json" } }
```

```bash
npx shadcn@latest add @gateling/meetings-integration
```

Files land at `src/integrations/meetings/*` and
`src/app/api/meetings-webhook/route.ts`; the three env vars above are appended
to `.env`. Docs and usage patterns:
<https://gateling-registry.vercel.app/integrations/meetings-integration>.
The block is the single source of truth for the client — when this API
changes, update the block (and bump its version), then consumers re-run the
install with `--overwrite`.

```ts
import { getMeetingsClient } from "@/integrations/meetings";

const meetings = getMeetingsClient(); // null when MEETINGS_* are not set
```

## 3. Create a meeting

Typically when the thing it belongs to is created (an order, a lesson, a
consultation). Pass your own id as `externalRef` so you can find it again, and
an idempotency key so a retried request cannot create two meetings.

```ts
// Instant — live the moment it is created.
const meeting = await meetings.createMeeting(
  {
    title: `Fitting — order #${order.id}`,
    externalRef: `order:${order.id}`,
    host: { externalId: staff.id, name: staff.name, email: staff.email },
  },
  `order:${order.id}:meeting`, // Idempotency-Key
);

// Scheduled — invitees get an email, an .ics, and a reminder.
await meetings.createMeeting({
  title: "Weekly sync",
  scheduledAt: "2026-09-20T10:00:00+03:00",
  durationMinutes: 45,
  timezone: "Africa/Cairo",
  host: { externalId: teacher.id, name: teacher.name },
  invitees: ["student@example.com"],
  settings: { waitingRoom: false },
});

await db.update(orders).set({ meetingCode: meeting.code });
```

`host` is a **linked user**: the first time an `externalId` is seen, an
account is created here (marked verified — your system vouched for them);
after that the same `externalId` always maps to the same account. Meetings it
hosts show up on that person's dashboard here too, if they ever sign in
directly.

## 4. Send someone in

When the person clicks "Join" in your UI, your **server** mints a link and
redirects. Do this per click — host links are single-use and expire in 10
minutes.

```ts
// app/orders/[id]/join/route.ts (Next.js route handler)
import { redirect } from "next/navigation";
import { meetings } from "@/integrations/meetings";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(); // your auth
  const order = await loadOrder(id);

  const link = await meetings.createJoinLink(order.meetingCode, {
    user: { externalId: user.id, name: user.name, email: user.email },
    role: user.id === order.staffId ? "host" : "participant",
    returnUrl: `https://atelier.gateling.com/orders/${id}`,
  });

  redirect(link.url);
}
```

What each role gets:

| Role | Lands on | Notes |
|---|---|---|
| `host` | The pre-join screen, signed in as the host. Full host controls (waiting room, mute, lock, end for all, breakout rooms). | Must be the `host.externalId` the meeting was created with — anyone else gets `403`. **Single-use**: a second click on the same URL shows "This link was already used"; mint a new one. |
| `participant` | The pre-join screen with their name filled in. Skips the passcode **and** the waiting room, like an emailed invitee. | Reusable until it expires. No account is created. |

`returnUrl` (optional) must be on one of the integration's allowed origins.
When set, the screen after leaving shows **"Back to *Name*"** pointing there
instead of "Back to home".

If a link cannot be honoured the person lands on `/sso/error?reason=expired|used|invalid`
with a translated explanation and a "Back to home" button. Handle `expired`
by simply sending them through your `/join` route again.

## 5. Hear back

Set a webhook URL and verify every delivery — see [`webhooks.md`](./webhooks.md)
for payloads and a verification snippet. Use `meeting.ended` to close the loop
(mark the order's session done, bill the lesson, …) and
`GET /meetings/:code/participants` for the attendance log.

## Reference

Base URL `https://meetings.gateling.com/api/v1`. Every request carries
`Authorization: Bearer gm_live_…`. Requests are JSON; dates are ISO 8601.
Errors are always:

```json
{ "error": { "code": "not_found", "message": "No such meeting.", "details": { … } } }
```

| Code | HTTP | Meaning |
|---|---|---|
| `unauthorized` | 401 | Missing, malformed, unknown or revoked API key. |
| `forbidden` | 403 | A host link for someone who isn't the host, or the owning organization's plan no longer includes API access. |
| `not_found` | 404 | No such meeting **for this integration** — other systems' meetings are invisible. |
| `validation_error` | 400 | Body or query failed validation; `details` is a zod tree with translated messages. |
| `conflict` | 409 | An `Idempotency-Key` request is still in flight. |
| `precondition_failed` | 412 | The meeting has ended, or the organization's plan cap (upcoming scheduled meetings) is reached. A meeting longer than the plan allows is a `validation_error`. |
| `rate_limited` | 429 | More than 120 requests/minute on this key. |

| Method | Path | Body / query | Returns |
|---|---|---|---|
| `POST` | `/meetings` | `title, host{externalId,name,email?}, externalRef?, scheduledAt?, durationMinutes?, timezone?, passcode?, settings?, invitees?` · header `Idempotency-Key` (24 h) | `201 { meeting }` (`Idempotent-Replayed: true` on a replay) |
| `GET` | `/meetings` | `?externalRef=&status=&limit=` | `{ meetings[] }` newest first |
| `GET` | `/meetings/:code` | | `{ meeting }` |
| `PATCH` | `/meetings/:code` | any of `title, scheduledAt, durationMinutes, timezone, passcode ("" clears), settings, externalRef` | `{ meeting }` |
| `DELETE` | `/meetings/:code` | | `204` — soft delete; the link stops resolving |
| `POST` | `/meetings/:code/end` | | `{ status }` — "End for all" |
| `POST` | `/meetings/:code/join-links` | `user{externalId,name,email?}, role, expiresIn? (60–86400 s), returnUrl?` | `201 { joinLink: { url, role, expiresAt, singleUse } }` |
| `GET` | `/meetings/:code/participants` | | `{ participants[] }` — `identity, displayName, role, externalId, joinedAt, leftAt` |

`meeting` fields: `id, code, title, status, externalRef, scheduledAt, durationMinutes, timezone, startedAt, endedAt, settings{waitingRoom, muteOnEntry, allowGuests, allowScreenShare, locked}, hasPasscode, guestUrl, createdAt`.

### Trying it locally

```bash
npm run db:start && npm run livekit && npm run inngest && npm run dev
```

Set `ADMIN_EMAILS=host@example.test` and a `JWT_SECRET_KEY` (32+ chars) in
`.env`, sign in, create an integration at `/settings/integrations`, then:

```bash
curl -s -X POST http://localhost:3000/api/v1/meetings \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"title":"Try","host":{"externalId":"u1","name":"Host"}}'
```

`e2e/integration.spec.ts` drives the entire loop — including a local webhook
receiver — and is the executable version of this document. gateling.com is the
reference consumer (`docs/meetings-integration.md` there).

## Not in scope

Embedding the room in an iframe (CSP forbids it on purpose), promoting a
linked user to co-host, per-integration branding, OAuth-style client
credentials, recording.
