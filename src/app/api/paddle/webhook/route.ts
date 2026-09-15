import { env } from "@/data/env/server";
import { db } from "@/drizzle";
import { BillingEventsTable } from "@/drizzle/schema";
import { parsePaddleEvent } from "@/features/billing/server/paddle-events";
import { inngest } from "@/integrations/inngest/client";
import { paddleWebhookReceivedEvent } from "@/integrations/inngest/functions/billing-events";
import { getPaddle } from "@/integrations/paddle/client";
import {
  enforcePaddleIpAllowlist,
  paddleIpAllowlist,
} from "@/integrations/paddle/ip-allowlist";
import { clientIpFromHeaders } from "@/integrations/paddle/ips";

/**
 * Paddle posts every notification here (the destination in Paddle →
 * Developer tools → Notifications subscribes to `HANDLED_PADDLE_EVENTS`:
 * `subscription.*`, `customer.created/updated` and `transaction.completed`;
 * anything else is stored and marked unhandled). In production the caller must be one
 * of Paddle's published IPs (403 otherwise; 503 while that list cannot
 * be fetched so Paddle retries), and the body is verified against the
 * webhook secret — an unsigned POST is a 401, never a row.
 *
 * The insert into `billing_events` is the idempotency claim: Paddle
 * retries anything it did not get a 200 for, and a replay of an event id
 * we already hold hits the unique index and is answered 200 without a
 * second run. Applying the change happens in Inngest so a slow database
 * never makes Paddle time out and retry.
 */
export async function POST(request: Request) {
  if (!env.PADDLE_WEBHOOK_SECRET) {
    return new Response("billing not configured", { status: 503 });
  }

  if (enforcePaddleIpAllowlist) {
    const ip = clientIpFromHeaders(request.headers);
    const verdict = await paddleIpAllowlist.check(ip);
    if (verdict === "denied") {
      console.warn("[paddle] webhook from non-Paddle address", ip);
      return new Response("forbidden", { status: 403 });
    }
    if (verdict === "unknown") {
      return new Response("ip allowlist unavailable", { status: 503 });
    }
  }

  const raw = await request.text();
  let event: Awaited<
    ReturnType<ReturnType<typeof getPaddle>["webhooks"]["unmarshal"]>
  >;
  try {
    event = await getPaddle().webhooks.unmarshal(
      raw,
      env.PADDLE_WEBHOOK_SECRET,
      request.headers.get("paddle-signature") ?? "",
    );
  } catch (error) {
    console.warn("[paddle] rejected webhook", error);
    return new Response("unauthorized", { status: 401 });
  }

  const payload = JSON.parse(raw) as Record<string, unknown>;
  // Only a custom-data hint at this point; the Inngest function resolves
  // the org properly (by subscription/customer id) before applying.
  let organizationId: string | null = null;
  try {
    const parsed = parsePaddleEvent(event.eventType, payload);
    if (parsed.kind === "subscription" || parsed.kind === "transaction") {
      organizationId = parsed.organizationId;
    }
  } catch {
    // Unparseable data is still stored; the function marks it unhandled.
  }

  const [row] = await db
    .insert(BillingEventsTable)
    .values({
      paddleEventId: event.eventId,
      eventType: event.eventType,
      occurredAt: new Date(event.occurredAt),
      organizationId,
      payload,
    })
    .onConflictDoNothing()
    .returning({ id: BillingEventsTable.id });

  if (row) {
    await inngest.send({
      ...paddleWebhookReceivedEvent.create({
        billingEventId: row.id,
        organizationId,
      }),
      id: `paddle:${event.eventId}`,
    });
  }

  return new Response("ok", { status: 200 });
}
