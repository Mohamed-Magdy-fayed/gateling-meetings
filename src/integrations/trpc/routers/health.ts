import { createTRPCRouter, publicProcedure } from "../init";

export const healthRouter = createTRPCRouter({
  ping: publicProcedure.query(() => ({ status: "ok" as const })),
});
