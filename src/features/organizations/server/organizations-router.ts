import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { setSessionOrganization } from "@/features/core/auth/core/session";
import {
  createTRPCRouter,
  orgProcedure,
  protectedProcedure,
} from "@/integrations/trpc/init";
import { listUserOrganizations } from "./service";

const summary = (org: {
  id: string;
  name: string;
  personalOwnerId: string | null;
  plan: "free" | "pro" | "business";
  planSource: "free" | "subscription" | "manual" | "trial";
  planExpiresAt: Date | null;
  seatLimit: number;
}) => ({
  id: org.id,
  name: org.name,
  isPersonal: org.personalOwnerId != null,
  plan: org.plan,
  planSource: org.planSource,
  planExpiresAt: org.planExpiresAt,
  seatLimit: org.seatLimit,
});

export const organizationsRouter = createTRPCRouter({
  /** The active org, the caller's role in it, and what it may do. */
  current: orgProcedure.query(({ ctx }) => ({
    organization: summary(ctx.organization),
    role: ctx.membership.role,
    isAdmin: ctx.isAdmin,
    entitlements: ctx.entitlements,
  })),

  /** Every org the caller belongs to — the switcher's menu. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await listUserOrganizations(ctx.db, ctx.session.user.id);
    return rows.map(({ organization, membership }) => ({
      ...summary(organization),
      role: membership.role,
    }));
  }),

  /** Makes another of the caller's orgs the active one for this session. */
  switch: protectedProcedure
    .input(z.object({ organizationId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await listUserOrganizations(ctx.db, ctx.session.user.id);
      const target = rows.find(
        (row) => row.organization.id === input.organizationId,
      );
      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: ctx.t("organizations.errors.notMember"),
        });
      }
      await setSessionOrganization(target.organization.id, ctx.cookies);
      return { organizationId: target.organization.id };
    }),
});
