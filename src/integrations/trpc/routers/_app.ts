import {
  hostRouter,
  joinRouter,
  meetingsRouter,
} from "@/features/meetings/server";
import { createTRPCRouter } from "../init";
import { healthRouter } from "./health";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  meetings: meetingsRouter,
  join: joinRouter,
  host: hostRouter,
});

export type AppRouter = typeof appRouter;
