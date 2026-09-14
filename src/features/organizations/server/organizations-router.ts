import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";

import { baseUrl } from "@/data/env/server";
import {
  OrganizationMembershipsTable,
  OrganizationsTable,
  organizationRoleValues,
  UsersTable,
  UserTokensTable,
} from "@/drizzle/schema";
import { EntitlementError } from "@/features/billing/plans";
import { normalizeEmail } from "@/features/core/auth/core/helpers";
import { setSessionOrganization } from "@/features/core/auth/core/session";
import { translationKey } from "@/features/core/i18n/global";
import { organizationInviteRequestedEvent } from "@/integrations/inngest/functions/meeting-events";
import { sendEvents } from "@/integrations/inngest/send";
import {
  createTRPCRouter,
  type OrgContext,
  orgAdminProcedure,
  orgProcedure,
  protectedProcedure,
} from "@/integrations/trpc/init";
import {
  createInvite,
  findLiveInvite,
  inviteUrl,
  listPendingInvites,
  pendingInvitesWhere,
} from "./invites";
import { listUserOrganizations } from "./service";

const organizationNameSchema = z
  .string()
  .trim()
  .min(1, translationKey("forms.validation.required"))
  .max(128, translationKey("forms.validation.max128"));

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

async function countMembers(ctx: OrgContext) {
  const [row] = await ctx.db
    .select({ value: count() })
    .from(OrganizationMembershipsTable)
    .where(
      eq(OrganizationMembershipsTable.organizationId, ctx.organization.id),
    );
  return row?.value ?? 0;
}

async function countPendingInvites(ctx: OrgContext) {
  const [row] = await ctx.db
    .select({ value: count() })
    .from(UserTokensTable)
    .where(pendingInvitesWhere(ctx.organization.id));
  return row?.value ?? 0;
}

/**
 * Members plus pending invites must fit the seat limit — an invite is a
 * seat spoken for, or a team of three could invite thirty. Platform
 * admins' orgs are unlimited.
 */
async function assertSeatAvailable(ctx: OrgContext) {
  if (ctx.entitlements.unlimited) return;
  const taken = (await countMembers(ctx)) + (await countPendingInvites(ctx));
  if (taken < ctx.entitlements.seatLimit) return;
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: ctx.t("organizations.errors.seatsFull"),
    cause: new EntitlementError("seats", ctx.entitlements.seatLimit),
  });
}

function requireTeamOrganization(ctx: OrgContext) {
  if (ctx.organization.personalOwnerId != null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: ctx.t("organizations.errors.personal"),
    });
  }
}

/** Owners may do everything; platform admins may do everything anywhere. */
function requireOwner(ctx: OrgContext) {
  if (ctx.isAdmin || ctx.membership.role === "owner") return;
  throw new TRPCError({ code: "FORBIDDEN" });
}

async function countOwners(ctx: OrgContext) {
  const [row] = await ctx.db
    .select({ value: count() })
    .from(OrganizationMembershipsTable)
    .where(
      and(
        eq(OrganizationMembershipsTable.organizationId, ctx.organization.id),
        eq(OrganizationMembershipsTable.role, "owner"),
      ),
    );
  return row?.value ?? 0;
}

export const organizationsRouter = createTRPCRouter({
  /** The active org, the caller's role in it, and what it may do. */
  current: orgProcedure.query(({ ctx }) => ({
    organization: {
      ...summary(ctx.organization),
      // Paddle.js identifies the buyer to Retain with this; it is an
      // opaque `ctm_` id, safe in the browser.
      paddleCustomerId: ctx.organization.paddleCustomerId,
    },
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

  /** A team org: the creator owns it; it starts on Free and becomes active. */
  create: protectedProcedure
    .input(z.object({ name: organizationNameSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const created = await ctx.db.transaction(async (trx) => {
        const [org] = await trx
          .insert(OrganizationsTable)
          .values({ name: input.name, createdBy: userId })
          .returning({ id: OrganizationsTable.id });
        if (!org) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await trx.insert(OrganizationMembershipsTable).values({
          organizationId: org.id,
          userId,
          role: "owner",
          createdBy: userId,
        });
        return org;
      });
      await setSessionOrganization(created.id, ctx.cookies);
      return { organizationId: created.id };
    }),

  rename: orgAdminProcedure
    .input(z.object({ name: organizationNameSchema }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(OrganizationsTable)
        .set({ name: input.name, updatedBy: ctx.session.user.id })
        .where(eq(OrganizationsTable.id, ctx.organization.id));
      return { ok: true };
    }),

  /** Not from a personal org, and never the last owner out of a team. */
  leave: orgProcedure.mutation(async ({ ctx }) => {
    requireTeamOrganization(ctx);
    if (ctx.membership.role === "owner" && (await countOwners(ctx)) <= 1) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: ctx.t("organizations.errors.lastOwner"),
      });
    }
    await ctx.db
      .delete(OrganizationMembershipsTable)
      .where(eq(OrganizationMembershipsTable.id, ctx.membership.id));
    // Back to the personal org; `orgMiddleware` heals the session anyway.
    const personal = (
      await listUserOrganizations(ctx.db, ctx.session.user.id)
    ).find((row) => row.organization.personalOwnerId === ctx.session.user.id);
    if (personal) {
      await setSessionOrganization(personal.organization.id, ctx.cookies);
    }
    return { ok: true };
  }),

  members: createTRPCRouter({
    list: orgProcedure.query(async ({ ctx }) => {
      const rows = await ctx.db.query.OrganizationMembershipsTable.findMany({
        where: eq(
          OrganizationMembershipsTable.organizationId,
          ctx.organization.id,
        ),
        orderBy: [OrganizationMembershipsTable.createdAt],
        with: { user: { columns: { id: true, email: true, name: true } } },
      });
      return {
        members: rows.map((row) => ({
          id: row.id,
          role: row.role,
          user: row.user,
          joinedAt: row.createdAt,
          isYou: row.userId === ctx.session.user.id,
        })),
        seatLimit: ctx.entitlements.seatLimit,
        unlimited: ctx.entitlements.unlimited,
      };
    }),

    /** Owner only; the personal owner's role and the last owner are fixed. */
    updateRole: orgAdminProcedure
      .input(
        z.object({
          userId: z.uuid(),
          role: z.enum(organizationRoleValues),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        requireOwner(ctx);
        if (input.userId === ctx.organization.personalOwnerId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: ctx.t("organizations.errors.personal"),
          });
        }
        const target =
          await ctx.db.query.OrganizationMembershipsTable.findFirst({
            where: and(
              eq(
                OrganizationMembershipsTable.organizationId,
                ctx.organization.id,
              ),
              eq(OrganizationMembershipsTable.userId, input.userId),
            ),
          });
        if (!target) throw new TRPCError({ code: "NOT_FOUND" });
        if (
          target.role === "owner" &&
          input.role !== "owner" &&
          (await countOwners(ctx)) <= 1
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: ctx.t("organizations.errors.lastOwner"),
          });
        }
        await ctx.db
          .update(OrganizationMembershipsTable)
          .set({ role: input.role, updatedBy: ctx.session.user.id })
          .where(eq(OrganizationMembershipsTable.id, target.id));
        return { ok: true };
      }),

    /** Admins may remove members; only owners may remove other owners. */
    remove: orgAdminProcedure
      .input(z.object({ userId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        if (input.userId === ctx.organization.personalOwnerId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: ctx.t("organizations.errors.personal"),
          });
        }
        const target =
          await ctx.db.query.OrganizationMembershipsTable.findFirst({
            where: and(
              eq(
                OrganizationMembershipsTable.organizationId,
                ctx.organization.id,
              ),
              eq(OrganizationMembershipsTable.userId, input.userId),
            ),
          });
        if (!target) throw new TRPCError({ code: "NOT_FOUND" });
        if (target.role === "owner") {
          requireOwner(ctx);
          if ((await countOwners(ctx)) <= 1) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: ctx.t("organizations.errors.lastOwner"),
            });
          }
        }
        await ctx.db
          .delete(OrganizationMembershipsTable)
          .where(eq(OrganizationMembershipsTable.id, target.id));
        return { ok: true };
      }),
  }),

  invites: createTRPCRouter({
    list: orgAdminProcedure.query(({ ctx }) =>
      listPendingInvites(ctx.db, ctx.organization.id),
    ),

    /**
     * Issues the invite and emails it; the link is also returned so the
     * inviter can hand it over directly (and so local e2e works without
     * SMTP). Accepting still requires signing in as that address.
     */
    create: orgAdminProcedure
      .input(
        z.object({
          email: z
            .string()
            .trim()
            .pipe(z.email(translationKey("auth.validation.invalidEmail"))),
          role: z.enum(["admin", "member"]).default("member"),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const email = normalizeEmail(input.email);
        const already = await ctx.db
          .select({ id: OrganizationMembershipsTable.id })
          .from(OrganizationMembershipsTable)
          .innerJoin(
            UsersTable,
            eq(UsersTable.id, OrganizationMembershipsTable.userId),
          )
          .where(
            and(
              eq(
                OrganizationMembershipsTable.organizationId,
                ctx.organization.id,
              ),
              eq(UsersTable.email, email),
            ),
          )
          .limit(1);
        if (already.length > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: ctx.t("organizations.errors.alreadyMember"),
          });
        }
        await assertSeatAvailable(ctx);
        const invite = await createInvite(ctx.db, {
          organizationId: ctx.organization.id,
          email,
          role: input.role,
          invitedBy: ctx.session.user.id,
        });
        await sendEvents(
          organizationInviteRequestedEvent.create({
            tokenId: invite.id,
            token: invite.token,
            locale: ctx.locale,
          }),
        );
        return {
          id: invite.id,
          email,
          url: inviteUrl(baseUrl, invite.token),
          expiresAt: invite.expiresAt,
        };
      }),

    revoke: orgAdminProcedure
      .input(z.object({ id: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        await ctx.db
          .delete(UserTokensTable)
          .where(
            and(
              eq(UserTokensTable.id, input.id),
              pendingInvitesWhere(ctx.organization.id),
            ),
          );
        return { ok: true };
      }),

    /** What the landing page shows before sign-in: never the invited email. */
    preview: protectedProcedure
      .input(z.object({ token: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        const invite = await findLiveInvite(ctx.db, input.token);
        if (!invite) return { status: "invalid" as const };
        const [organization, inviter] = await Promise.all([
          ctx.db.query.OrganizationsTable.findFirst({
            where: eq(OrganizationsTable.id, invite.metadata.organizationId),
            columns: { id: true, name: true },
          }),
          ctx.db.query.UsersTable.findFirst({
            where: eq(UsersTable.id, invite.metadata.invitedBy),
            columns: { name: true, email: true },
          }),
        ]);
        if (!organization) return { status: "invalid" as const };
        const matches =
          normalizeEmail(ctx.session.user.email ?? "") ===
          invite.metadata.email;
        return {
          status: matches ? ("ok" as const) : ("wrong-account" as const),
          organization,
          inviterName: inviter?.name ?? inviter?.email ?? "",
          role: invite.metadata.role,
        };
      }),

    /** Signed in as the invited address → member, and the org goes active. */
    accept: protectedProcedure
      .input(z.object({ token: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const invite = await findLiveInvite(ctx.db, input.token);
        if (!invite) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: ctx.t("organizations.invite.invalid"),
          });
        }
        if (
          normalizeEmail(ctx.session.user.email ?? "") !== invite.metadata.email
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: ctx.t("organizations.invite.wrongAccount"),
          });
        }
        const { organizationId, role } = invite.metadata;
        await ctx.db.transaction(async (trx) => {
          await trx
            .insert(OrganizationMembershipsTable)
            .values({
              organizationId,
              userId: ctx.session.user.id,
              role,
              createdBy: invite.metadata.invitedBy,
            })
            .onConflictDoNothing();
          await trx
            .update(UserTokensTable)
            .set({ consumedAt: new Date(), userId: ctx.session.user.id })
            .where(eq(UserTokensTable.id, invite.id));
        });
        await setSessionOrganization(organizationId, ctx.cookies);
        return { organizationId };
      }),
  }),
});
