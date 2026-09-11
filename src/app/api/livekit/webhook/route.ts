import { WebhookReceiver } from "livekit-server-sdk";

import { inngest } from "@/integrations/inngest/client";
import { liveKitWebhookEvent } from "@/integrations/inngest/functions/on-livekit-webhook";
import { getLiveKitConfig } from "@/integrations/livekit/client";

/**
 * LiveKit posts room/participant lifecycle events here (configure the URL in
 * the LiveKit Cloud dashboard, or `webhook.urls` in livekit.yaml). The body
 * is verified against our API secret — an unsigned POST is a 401, never a
 * row in the attendance log.
 */
export async function POST(request: Request) {
  const { apiKey, apiSecret } = getLiveKitConfig();
  const receiver = new WebhookReceiver(apiKey, apiSecret);

  let event: Awaited<ReturnType<WebhookReceiver["receive"]>>;
  try {
    event = await receiver.receive(
      await request.text(),
      request.headers.get("authorization") ?? undefined,
    );
  } catch (error) {
    console.warn("[livekit] rejected webhook", error);
    return new Response("unauthorized", { status: 401 });
  }

  const room = event.room?.name;
  if (!room) return new Response("ignored", { status: 202 });

  await inngest.send(
    liveKitWebhookEvent.create({
      event: event.event,
      room,
      createdAt: Number(event.createdAt),
      participant: event.participant
        ? {
            identity: event.participant.identity,
            name: event.participant.name,
            attributes: event.participant.attributes,
          }
        : undefined,
    }),
  );

  return new Response("ok", { status: 200 });
}
