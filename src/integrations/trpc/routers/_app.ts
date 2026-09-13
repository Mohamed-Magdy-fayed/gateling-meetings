import { adminRouter } from "@/features/admin/server/admin-router";
import { integrationsRouter } from "@/features/integrations/server/integrations-router";
import {
  breakoutsRouter,
  hostRouter,
  invitesRouter,
  joinRouter,
  meetingsRouter,
} from "@/features/meetings/server";
import { organizationsRouter } from "@/features/organizations/server/organizations-router";
import { createTRPCRouter } from "../init";
import { healthRouter } from "./health";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  meetings: meetingsRouter,
  join: joinRouter,
  host: hostRouter,
  invites: invitesRouter,
  breakouts: breakoutsRouter,
  integrations: integrationsRouter,
  organizations: organizationsRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
