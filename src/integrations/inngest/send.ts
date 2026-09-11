import "server-only";

import { inngest } from "./client";

type Events = Parameters<typeof inngest.send>[0];

/**
 * `inngest.send` that never fails the request. The row a mutation just
 * wrote is the source of truth; the event only schedules follow-up work
 * (an email, a reminder). Losing that is a logged incident to chase, not a
 * reason to show the person a 500 for a meeting that was in fact created.
 * Locally, this is also what lets the app run without `npm run inngest`.
 */
export async function sendEvents(events: Events): Promise<boolean> {
  try {
    await inngest.send(events);
    return true;
  } catch (error) {
    const names = (Array.isArray(events) ? events : [events])
      .map((event) => event.name)
      .join(", ");
    console.error(`[inngest] failed to send ${names}`, error);
    return false;
  }
}
