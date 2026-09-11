import {
  hostRouter,
  invitesRouter,
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
  invites: invitesRouter,
});

export type AppRouter = typeof appRouter;
