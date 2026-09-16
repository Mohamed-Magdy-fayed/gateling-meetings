import { and, eq } from "drizzle-orm";

import { db } from "@/drizzle";
import { BillingEventsTable, billingProviderValues } from "@/drizzle/schema";
import {
  type BillingProvider,
  billingProviderFor,
  type WebhookKind,
  WebhookVerificationError,
} from "@/features/billing/server/provider";
import { inngest } from "@/integrations/inngest/client";
import { billingWebhookReceivedEvent } from "@/integrations/inngest/functions/billing-events";

const KINDS = new Set<WebhookKind>(["transaction", "subscription"]);

/**
 * `POST /api/billing/webhook/<provider>/<kind>[/<token>]` — every provider
 * callback lands here. The adapter authenticates it (Paymob: the HMAC on
 * the transaction callback, the secret path token on the subscription
 * webhook); an unverifiable post is a 401, never a row.
 *
 * The insert into `billing_events` is the idempotency claim: a replay of
 * an event id we already hold hits the unique index and is answered 200
 * without a second run. Applying the change happens in Inngest so a slow
 * database never makes the provider time out — Paymob in particular does
 * not retry reliably, so this route stores and answers fast.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string; segments: string[] }> },
) {
  const { provider: providerParam, segments } = await params;
  const providerId = billingProviderValues.find((id) => id === providerParam);
  const kind = segments[0] as WebhookKind | undefined;
  if (!providerId || !kind || !KINDS.has(kind)) {
    return new Response("not found", { status: 404 });
  }

  let provider: BillingProvider;
  try {
    provider = await billingProviderFor(providerId);
  } catch {
    return new Response("billing not configured", { status: 503 });
  }

  const rawBody = await request.text();
  let verified: Awaited<ReturnType<BillingProvider["verifyWebhook"]>>;
  try {
    verified = await provider.verifyWebhook({
      kind,
      rawBody,
      url: new URL(request.url),
      headers: request.headers,
      pathToken: segments[1] ?? null,
    });
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      console.warn(
        `[billing:${providerId}] rejected ${kind} webhook`,
        error.message,
      );
      return new Response("unauthorized", { status: 401 });
    }
    // The adapter's own prerequisites are missing (no secret configured).
    console.error(`[billing:${providerId}] webhook verification failed`, error);
    return new Response("billing not configured", { status: 503 });
  }

  // Only a hint at this point; the Inngest function resolves the org
  // properly (checkout row, subscription id) before applying anything.
  let organizationId: string | null = null;
  try {
    const parsed = provider.parseEvent(verified.eventType, verified.payload);
    if (parsed.kind === "transaction" || parsed.kind === "customer") {
      organizationId = await organizationHint(
        providerId,
        parsed.providerOrderId,
      );
    }
  } catch {
    // Unparseable data is still stored; the function marks it unhandled.
  }

  const [inserted] = await db
    .insert(BillingEventsTable)
    .values({
      provider: providerId,
      providerEventId: verified.providerEventId,
      eventType: verified.eventType,
      occurredAt: verified.occurredAt,
      organizationId,
      payload: verified.payload,
    })
    .onConflictDoNothing()
    .returning({ id: BillingEventsTable.id });

  // A replay of an id we already hold is normally a no-op — unless the
  // first delivery stored the row and then failed to dispatch (Inngest
  // down, misconfigured env). Answering 200 then would strand the event,
  // so an unprocessed duplicate is dispatched again; Inngest dedupes on
  // the idempotency `id` if the first send did in fact land.
  const row =
    inserted ??
    (await unprocessedDuplicate(providerId, verified.providerEventId));

  if (row) {
    await inngest.send({
      ...billingWebhookReceivedEvent.create({
        billingEventId: row.id,
        organizationId,
      }),
      id: `${providerId}:${verified.providerEventId}`,
    });
  }

  return new Response("ok", { status: 200 });
}

/**
 * Some providers (Paymob) also send the browser to the callback URL with
 * a GET after payment. The browser is sent to our return URL instead, so
 * a GET here is simply not a webhook.
 */
export function GET() {
  return new Response("method not allowed", { status: 405 });
}

async function organizationHint(
  providerId: (typeof billingProviderValues)[number],
  providerOrderId: string | null,
): Promise<string | null> {
  if (!providerOrderId) return null;
  const { findOrganizationForBilling } = await import(
    "@/features/billing/server/subscriptions"
  );
  return findOrganizationForBilling(db, providerId, { providerOrderId });
}

async function unprocessedDuplicate(
  provider: (typeof billingProviderValues)[number],
  providerEventId: string,
) {
  const existing = await db.query.BillingEventsTable.findFirst({
    where: and(
      eq(BillingEventsTable.provider, provider),
      eq(BillingEventsTable.providerEventId, providerEventId),
    ),
    columns: { id: true, processedAt: true },
  });
  return existing && !existing.processedAt ? { id: existing.id } : null;
}
