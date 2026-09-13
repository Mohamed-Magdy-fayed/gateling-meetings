import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/data/env/server";
import { IntegrationsTable, WebhookDeliveriesTable } from "@/drizzle/schema";
import { assertEntitlement } from "@/features/billing/plans";
import { generateApiKey, generateWebhookSecret } from "@/integrations/api/keys";
import {
  createTRPCRouter,
  type OrgContext,
  orgAdminProcedure,
} from "@/integrations/trpc/init";
import {
  createIntegrationSchema,
  integrationIdSchema,
  isAcceptableWebhookUrl,
} from "./schemas";

const isDeployed =
  env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "production";

const DELIVERIES_LIMIT = 50;

/** Everything except the hash — the list must never carry it. */
const listColumns = {
  id: true,
  name: true,
  slug: true,
  organizationId: true,
  apiKeyPrefix: true,
  webhookUrl: true,
  allowedReturnOrigins: true,
  createdAt: true,
  revokedAt: true,
  lastUsedAt: true,
} as const;

/**
 * Tenancy for keys. An org's owners/admins see the org's own integrations;
 * a platform admin sees everything, including platform integrations
 * (`organizationId` null), which nobody else can create or even list.
 */
function integrationScope(ctx: OrgContext): SQL | undefined {
  if (ctx.isAdmin) return undefined;
  return eq(IntegrationsTable.organizationId, ctx.organization.id);
}

async function requireScopedIntegration(ctx: OrgContext, id: string) {
  const integration = await ctx.db.query.IntegrationsTable.findFirst({
    where: and(eq(IntegrationsTable.id, id), integrationScope(ctx)),
    columns: { id: true, organizationId: true },
  });
  if (!integration) throw new TRPCError({ code: "NOT_FOUND" });
  return integration;
}

/**
 * Self-serve management of connected systems, gated by the org's plan
 * (`apiAccess` — Business). The API key and webhook secret exist in clear
 * exactly once — in the response of `create` and `rotateKey` — and the
 * settings page shows them in a copy dialog.
 */
export const integrationsRouter = createTRPCRouter({
  list: orgAdminProcedure.query(({ ctx }) =>
    ctx.db.query.IntegrationsTable.findMany({
      where: integrationScope(ctx),
      orderBy: [desc(IntegrationsTable.createdAt)],
      columns: listColumns,
    }),
  ),

  create: orgAdminProcedure
    .input(
      createIntegrationSchema.extend({
        /** Admin-only: a platform integration owned by no org and never capped. */
        platform: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const platform = input.platform && ctx.isAdmin;
      if (!platform) assertEntitlement(ctx.t, ctx.entitlements, "apiAccess");
      if (
        input.webhookUrl &&
        !isAcceptableWebhookUrl(input.webhookUrl, isDeployed)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: ctx.t("integrations.admin.validation.webhookHttps"),
        });
      }
      const taken = await ctx.db.query.IntegrationsTable.findFirst({
        where: eq(IntegrationsTable.slug, input.slug),
        columns: { id: true },
      });
      if (taken) {
        throw new TRPCError({
          code: "CONFLICT",
          message: ctx.t("integrations.admin.validation.slugTaken"),
        });
      }

      const apiKey = generateApiKey();
      const webhookSecret = generateWebhookSecret();
      const [created] = await ctx.db
        .insert(IntegrationsTable)
        .values({
          name: input.name,
          slug: input.slug,
          organizationId: platform ? null : ctx.organization.id,
          apiKeyPrefix: apiKey.prefix,
          apiKeyHash: apiKey.hash,
          webhookUrl: input.webhookUrl || null,
          webhookSecret,
          allowedReturnOrigins: input.allowedReturnOrigins,
          createdBy: ctx.session.user.id,
        })
        .returning({ id: IntegrationsTable.id });
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return { id: created.id, apiKey: apiKey.key, webhookSecret };
    }),

  /** New key + new webhook secret; the old pair stops working at once. */
  rotateKey: orgAdminProcedure
    .input(integrationIdSchema)
    .mutation(async ({ ctx, input }) => {
      const integration = await requireScopedIntegration(ctx, input.id);
      // A lapsed plan cannot mint a fresh key for a key it may no longer use.
      if (integration.organizationId) {
        assertEntitlement(ctx.t, ctx.entitlements, "apiAccess");
      }
      const apiKey = generateApiKey();
      const webhookSecret = generateWebhookSecret();
      const [updated] = await ctx.db
        .update(IntegrationsTable)
        .set({
          apiKeyPrefix: apiKey.prefix,
          apiKeyHash: apiKey.hash,
          webhookSecret,
          revokedAt: null,
          updatedBy: ctx.session.user.id,
        })
        .where(eq(IntegrationsTable.id, integration.id))
        .returning({ id: IntegrationsTable.id });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: updated.id, apiKey: apiKey.key, webhookSecret };
    }),

  /** The key, every minted link and every pending webhook stop working. */
  revoke: orgAdminProcedure
    .input(integrationIdSchema)
    .mutation(async ({ ctx, input }) => {
      const integration = await requireScopedIntegration(ctx, input.id);
      await ctx.db
        .update(IntegrationsTable)
        .set({ revokedAt: new Date(), updatedBy: ctx.session.user.id })
        .where(eq(IntegrationsTable.id, integration.id));
      return { ok: true };
    }),

  deliveries: orgAdminProcedure
    .input(z.object({ integrationId: z.uuid().optional() }))
    .query(({ ctx, input }) => {
      const scope = integrationScope(ctx);
      return ctx.db.query.WebhookDeliveriesTable.findMany({
        where: and(
          input.integrationId
            ? eq(WebhookDeliveriesTable.integrationId, input.integrationId)
            : undefined,
          scope
            ? inArray(
                WebhookDeliveriesTable.integrationId,
                ctx.db
                  .select({ id: IntegrationsTable.id })
                  .from(IntegrationsTable)
                  .where(scope),
              )
            : undefined,
        ),
        orderBy: [desc(WebhookDeliveriesTable.createdAt)],
        limit: DELIVERIES_LIMIT,
        columns: {
          id: true,
          integrationId: true,
          event: true,
          status: true,
          attempts: true,
          lastError: true,
          createdAt: true,
          deliveredAt: true,
        },
        with: { integration: { columns: { name: true } } },
      });
    }),
});
