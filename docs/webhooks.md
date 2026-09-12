# Outbound webhooks

When a meeting was created through the API (it carries an `integrationId`),
Gateling Meetings POSTs lifecycle events to the integration's **webhook URL**
(set on `/settings/integrations`). Integrations without a URL get nothing.

Deliveries go through Inngest: **6 attempts** (initial + 5 retries with
backoff, spread over roughly an hour). Any `2xx` counts as delivered; anything
else — a non-2xx, a timeout (10 s), a connection error — is retried. Every
delivery is a row in `webhook_deliveries`, visible with its status and last
error on the admin page.

## Request

```
POST <webhookUrl>
Content-Type: application/json
User-Agent: gateling-meetings-webhooks/1
X-Meetings-Event: meeting.ended
X-Meetings-Delivery: 59c6c396-adfc-4d99-8ba4-d941b46998ed
X-Meetings-Signature: t=1789197802,v1=a2c5659d…f80f
```

```json
{
  "id": "59c6c396-adfc-4d99-8ba4-d941b46998ed",
  "event": "meeting.ended",
  "createdAt": "2026-09-12T07:23:22.306Z",
  "data": { "...": "see below" }
}
```

`id` is stable across retries — **deduplicate on it**. Respond `2xx` quickly
and do the work afterwards; a slow handler is retried as if it had failed.

## Events

Every event's `data.meeting` is:

```json
{
  "id": "2a5897c9-…",
  "code": "dsf-wxgm-kqk",
  "title": "Smoke meeting",
  "status": "scheduled | live | ended",
  "externalRef": "order:8812",
  "scheduledAt": "2026-09-12T10:00:00.000Z",
  "startedAt": "2026-09-12T07:19:43.285Z",
  "endedAt": null
}
```

| Event | When | Extra `data` fields |
|---|---|---|
| `meeting.started` | The LiveKit room came up — the first person (normally the host) connected. | `at` |
| `meeting.ended` | The host or the API ended the meeting, or the room closed on its own. | `endedBy`: `"host"`, `"integration"` or `"room"` |
| `participant.joined` | Someone connected to the room. | `participant: { identity, name, role }`, `at` |
| `participant.left` | Someone disconnected. | `participant: { identity, name, role }`, `at` |

`participant.role` is `"host"` only when the identity is the meeting host's
account (`user:<id>`); it is derived server-side from the database, never from
anything the client sent. Guests are `guest:<random>` — a person who drops and
rejoins is two `joined` events with different identities, which is the truth
of what happened. Participant links do not expose the external id to the room,
so `participant.*` events for guests carry no `externalId`; the host's is
available through `GET /api/v1/meetings/:code/participants`.

`meeting.started` / `.ended` / `participant.*` from LiveKit require the
LiveKit webhook to be configured (`/api/livekit/webhook`, see the README).
`meeting.ended` with `endedBy: "host" | "integration"` is emitted by the app
itself and needs nothing else.

## Verifying the signature

The signature header is `t=<unix seconds>,v1=<hex>` where
`v1 = HMAC-SHA256(webhookSecret, "<t>.<raw body>")`. Compare in constant time
and reject timestamps older than a few minutes so a captured delivery cannot
be replayed.

```ts
// Next.js route handler: app/api/meetings-webhook/route.ts
import crypto from "node:crypto";

const SECRET = process.env.MEETINGS_WEBHOOK_SECRET!;
const TOLERANCE_SECONDS = 5 * 60;

function verify(header: string | null, body: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.trim().split("=") as [string, string]),
  );
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !parts.v1) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > TOLERANCE_SECONDS) {
    return false;
  }
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(parts.v1, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const body = await request.text(); // raw — do not JSON.parse before verifying
  if (!verify(request.headers.get("x-meetings-signature"), body)) {
    return new Response("invalid signature", { status: 401 });
  }
  const delivery = JSON.parse(body) as {
    id: string;
    event: string;
    createdAt: string;
    data: Record<string, unknown>;
  };

  // Dedupe on delivery.id, then hand off (queue / Inngest) and return fast.
  return new Response("ok", { status: 200 });
}
```

The same helpers exist in this repo at `src/integrations/webhooks/signature.ts`
(`verifyWebhookSignature`) if you would rather copy a tested implementation.

## Rotating the secret

The webhook secret is issued together with the API key and shown once.
"Rotate key" on the admin page issues a new API key **and** a new webhook
secret; update both in the other system at the same time.
