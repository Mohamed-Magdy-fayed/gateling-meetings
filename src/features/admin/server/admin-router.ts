import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";

import {
  MeetingsTable,
  OrganizationMembershipsTable,
  OrganizationsTable,
  PlanGrantsTable,
  UsersTable,
} from "@/drizzle/schema";
import { applyPlanGrant } from "@/features/billing/server/grants";
import { normalizeEmail } from "@/features/core/auth/core/helpers";
import { adminProcedure, createTRPCRouter } from "@/integrations/trpc/init";
import {
  grantIdSchema,
  planGrantSchema,
  searchSchema,
  setPlanSchema,
} from "./schemas";

const RECENT_MEETINGS = 20;

/**
 * The platform operator's view: every org, its plan, and the levers to
 * comp one. Guarded by `ADMIN_EMAILS`; there is no in-app way to become
 * an admin.
 */
export const adminRouter = createTRPCRouter({
  organizations: createTRPCRouter({
    list: adminProcedure.input(searchSchema).query(async ({ ctx, input }) => {
      const q = input.query ? `%${input.query}%` : null;
      const rows = await ctx.db.query.OrganizationsTable.findMany({
        where: and(
          isNull(OrganizationsTable.deletedAt),
          q
            ? or(
                ilike(OrganizationsTable.name, q),
                inArray(
                  OrganizationsTable.personalOwnerId,
                  ctx.db
                    .select({ id: UsersTable.id })
                    .from(UsersTable)
                    .where(ilike(UsersTable.email, q)),
                ),
              )
            : undefined,
        ),
        orderBy: [desc(OrganizationsTable.createdAt)],
        limit: input.limit,
        with: {
          personalOwner: { columns: { email: true } },
          memberships: { columns: { id: true } },
        },
      });
      return rows.map(({ memberships, personalOwner, ...org }) => ({
        id: org.id,
        name: org.name,
        isPersonal: org.personalOwnerId != null,
        ownerEmail: personalOwner?.email ?? null,
        plan: org.plan,
        planSource: org.planSource,
        planExpiresAt: org.planExpiresAt,
        seatLimit: org.seatLimit,
        memberCount: memberships.length,
        createdAt: org.createdAt,
      }));
    }),

    get: adminProcedure
      .input(z.object({ id: z.uuid() }))
      .query(async ({ ctx, input }) => {
        const org = await ctx.db.query.OrganizationsTable.findFirst({
          where: eq(OrganizationsTable.id, input.id),
          with: {
            personalOwner: { columns: { email: true } },
            memberships: {
              with: {
                user: { columns: { id: true, email: true, name: true } },
              },
              orderBy: [OrganizationMembershipsTable.createdAt],
            },
          },
        });
        if (!org) throw new TRPCError({ code: "NOT_FOUND" });
        const meetings = await ctx.db.query.MeetingsTable.findMany({
          where: and(
            eq(MeetingsTable.organizationId, org.id),
            isNull(MeetingsTable.deletedAt),
          ),
          orderBy: [desc(MeetingsTable.createdAt)],
          limit: RECENT_MEETINGS,
          columns: {
            id: true,
            code: true,
            title: true,
            status: true,
            scheduledAt: true,
            startedAt: true,
            createdAt: true,
          },
        });
        const { memberships, personalOwner, ...fields } = org;
        return {
          ...fields,
          ownerEmail: personalOwner?.email ?? null,
          members: memberships.map((m) => ({
            id: m.id,
            role: m.role,
            user: m.user,
            createdAt: m.createdAt,
          })),
          meetings,
        };
      }),

    setPlan: adminProcedure
      .input(setPlanSchema)
      .mutation(async ({ ctx, input }) => {
        const resetting = input.plan === "free" && input.planSource === "free";
        const [updated] = await ctx.db
          .update(OrganizationsTable)
          .set({
            plan: input.plan,
            planSource: input.planSource,
            seatLimit: input.seatLimit,
            planExpiresAt: resetting ? null : input.planExpiresAt,
            planNote: resetting ? null : input.planNote,
            updatedBy: ctx.session.user.id,
          })
          .where(eq(OrganizationsTable.id, input.id))
          .returning({ id: OrganizationsTable.id });
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        return updated;
      }),
  }),

  grants: createTRPCRouter({
    list: adminProcedure
      .input(z.object({ includeConsumed: z.boolean().default(false) }))
      .query(({ ctx, input }) =>
        ctx.db.query.PlanGrantsTable.findMany({
          where: input.includeConsumed
            ? undefined
            : isNull(PlanGrantsTable.consumedAt),
          orderBy: [desc(PlanGrantsTable.createdAt)],
          limit: 200,
        }),
      ),

    /**
     * If the address already has an account the grant is applied to their
     * personal org right away (and recorded as consumed); otherwise it
     * waits for them to sign up.
     */
    create: adminProcedure
      .input(planGrantSchema)
      .mutation(async ({ ctx, input }) => {
        const email = normalizeEmail(input.email);
        const grantedBy = ctx.session.user.email ?? ctx.session.user.id;
        return ctx.db.transaction(async (trx) => {
          const [grant] = await trx
            .insert(PlanGrantsTable)
            .values({
              email,
              plan: input.plan,
              seatLimit: input.seatLimit,
              expiresAt: input.expiresAt,
              note: input.note,
              grantedBy,
            })
            .returning();
          if (!grant) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

          const existing = await trx.query.UsersTable.findFirst({
            where: eq(UsersTable.email, email),
            columns: { id: true },
          });
          if (!existing) return { ...grant, appliedNow: false };
          const org = await trx.query.OrganizationsTable.findFirst({
            where: eq(OrganizationsTable.personalOwnerId, existing.id),
          });
          if (!org) return { ...grant, appliedNow: false };
          await applyPlanGrant(trx, org, email);
          return { ...grant, appliedNow: true };
        });
      }),

    update: adminProcedure
      .input(planGrantSchema.partial().extend(grantIdSchema.shape))
      .mutation(async ({ ctx, input }) => {
        const { id, email, ...fields } = input;
        const [updated] = await ctx.db
          .update(PlanGrantsTable)
          .set({
            ...fields,
            ...(email ? { email: normalizeEmail(email) } : {}),
            updatedBy: ctx.session.user.id,
          })
          .where(
            and(eq(PlanGrantsTable.id, id), isNull(PlanGrantsTable.consumedAt)),
          )
          .returning({ id: PlanGrantsTable.id });
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        return updated;
      }),

    /** Only a pending grant can be withdrawn; consumed ones are history. */
    delete: adminProcedure
      .input(grantIdSchema)
      .mutation(async ({ ctx, input }) => {
        const [deleted] = await ctx.db
          .delete(PlanGrantsTable)
          .where(
            and(
              eq(PlanGrantsTable.id, input.id),
              isNull(PlanGrantsTable.consumedAt),
            ),
          )
          .returning({ id: PlanGrantsTable.id });
        if (!deleted) throw new TRPCError({ code: "NOT_FOUND" });
        return deleted;
      }),
  }),

  users: createTRPCRouter({
    list: adminProcedure.input(searchSchema).query(async ({ ctx, input }) => {
      const q = input.query ? `%${input.query}%` : null;
      const rows = await ctx.db.query.UsersTable.findMany({
        where: and(
          isNull(UsersTable.deletedAt),
          q
            ? or(ilike(UsersTable.email, q), ilike(UsersTable.name, q))
            : undefined,
        ),
        orderBy: [desc(UsersTable.createdAt)],
        limit: input.limit,
        columns: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          lastSignInAt: true,
          emailVerifiedAt: true,
        },
      });
      const orgs = rows.length
        ? await ctx.db.query.OrganizationsTable.findMany({
            where: inArray(
              OrganizationsTable.personalOwnerId,
              rows.map((row) => row.id),
            ),
            columns: {
              id: true,
              personalOwnerId: true,
              plan: true,
              planSource: true,
            },
          })
        : [];
      const byOwner = new Map(orgs.map((org) => [org.personalOwnerId, org]));
      return rows.map((user) => {
        const org = byOwner.get(user.id);
        return {
          ...user,
          personalOrganization: org
            ? { id: org.id, plan: org.plan, planSource: org.planSource }
            : null,
        };
      });
    }),
  }),
});
