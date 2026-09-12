import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/data/env/server";
import { IntegrationsTable, WebhookDeliveriesTable } from "@/drizzle/schema";
import { generateApiKey, generateWebhookSecret } from "@/integrations/api/keys";
import { adminProcedure, createTRPCRouter } from "@/integrations/trpc/init";
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
  apiKeyPrefix: true,
  webhookUrl: true,
  allowedReturnOrigins: true,
  createdAt: true,
  revokedAt: true,
  lastUsedAt: true,
} as const;

/**
 * Admin-only management of connected systems. The API key and webhook
 * secret exist in clear exactly once — in the response of `create` and
 * `rotateKey` — and the admin page shows them in a copy dialog.
 */
export const integrationsRouter = createTRPCRouter({
  list: adminProcedure.query(({ ctx }) =>
    ctx.db.query.IntegrationsTable.findMany({
      orderBy: [desc(IntegrationsTable.createdAt)],
      columns: listColumns,
    }),
  ),

  create: adminProcedure
    .input(createIntegrationSchema)
    .mutation(async ({ ctx, input }) => {
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
  rotateKey: adminProcedure
    .input(integrationIdSchema)
    .mutation(async ({ ctx, input }) => {
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
        .where(eq(IntegrationsTable.id, input.id))
        .returning({ id: IntegrationsTable.id });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: updated.id, apiKey: apiKey.key, webhookSecret };
    }),

  /** The key, every minted link and every pending webhook stop working. */
  revoke: adminProcedure
    .input(integrationIdSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(IntegrationsTable)
        .set({ revokedAt: new Date(), updatedBy: ctx.session.user.id })
        .where(eq(IntegrationsTable.id, input.id));
      return { ok: true };
    }),

  deliveries: adminProcedure
    .input(z.object({ integrationId: z.uuid().optional() }))
    .query(({ ctx, input }) =>
      ctx.db.query.WebhookDeliveriesTable.findMany({
        where: input.integrationId
          ? eq(WebhookDeliveriesTable.integrationId, input.integrationId)
          : undefined,
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
      }),
    ),
});
