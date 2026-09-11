import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import {
  exceedsBatchLimit,
  MAX_TRPC_BATCH_SIZE,
} from "@/integrations/trpc/batch-limit";
import { createTRPCContext } from "@/integrations/trpc/init";
import { appRouter } from "@/integrations/trpc/routers/_app";

export const dynamic = "force-dynamic";

const handler = (req: Request) => {
  // Rejected before `fetchRequestHandler` so an oversized batch costs one URL
  // parse rather than N procedure executions — the point of the cap is not to
  // do the work, so checking after it ran would be pointless.
  if (exceedsBatchLimit(req.url)) {
    return new Response(
      JSON.stringify({
        error: {
          message: `Too many procedures in one request (max ${MAX_TRPC_BATCH_SIZE}).`,
          code: "PAYLOAD_TOO_LARGE",
        },
      }),
      { status: 413, headers: { "content-type": "application/json" } },
    );
  }

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext(),
  });
};

export { handler as GET, handler as POST };
