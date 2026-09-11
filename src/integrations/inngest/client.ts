import { Inngest } from "inngest";

/**
 * How long a single request to Inngest may take before it is abandoned.
 *
 * The SDK sets no timeout of its own, so an unresponsive host would hold the
 * caller open until the platform terminated it. That matters most on a request
 * path: `groups.create` sends an event and falls back to generating sessions
 * inline when the send fails (STATE.md D163), and a fallback that only triggers
 * after the whole request has been killed is not a fallback.
 *
 * The SDK still retries a failed send internally, so this bounds each attempt
 * rather than the total — which is the part that was unbounded.
 */
const INNGEST_REQUEST_TIMEOUT_MS = 10_000;

export const inngest = new Inngest({
  id: "gateling-meetings",
  fetch: (input, init) => {
    const timeout = AbortSignal.timeout(INNGEST_REQUEST_TIMEOUT_MS);
    // Combined rather than replaced: the SDK passes its own signal for
    // cancellation, and overwriting it would make that cancellation silently
    // stop working.
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeout])
      : timeout;

    return fetch(input, { ...init, signal });
  },
});
