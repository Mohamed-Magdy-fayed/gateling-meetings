import {
  chat,
  type ModelMessage,
  maxIterations,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { createGeminiChat, GEMINI_MODELS } from "@tanstack/ai-gemini";
import { cookies } from "next/headers";
import { z } from "zod";

import { baseUrl, companionConfig } from "@/data/env/server";
import { db } from "@/drizzle";
import { resolveEntitlements } from "@/features/billing/plans";
import {
  companionUsageToday,
  consumeCompanionMessage,
} from "@/features/companion/server/limits";
import { buildSystemPrompt } from "@/features/companion/server/prompt";
import { companionTools } from "@/features/companion/server/tools";
import { isAdminEmail } from "@/features/core/auth/core/admin";
import { getUserSession } from "@/features/core/auth/core/session";
import { LOCALE_COOKIE_NAME } from "@/features/core/i18n/lib";
import { getT } from "@/features/core/i18n/server";
import { loadActiveOrganization } from "@/features/organizations/server/service";
import { companionRatelimit, isRateLimited } from "@/integrations/ratelimit";

export const runtime = "nodejs";

/** Spend controls that are not about *who* but about *how much per turn*. */
const MAX_MESSAGE_CHARS = 1000;
const MAX_HISTORY = 8;
const MAX_OUTPUT_TOKENS = 400;
const MAX_TOOL_ROUNDS = 3;

const messageSchema = z.looseObject({
  role: z.enum(["user", "assistant", "tool"]),
  content: z.union([z.string(), z.null(), z.array(z.looseObject({}))]),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(200),
  timeZone: z.string().max(64).optional(),
  locale: z.enum(["en", "ar"]).optional(),
  data: z
    .object({
      timeZone: z.string().max(64).optional(),
      locale: z.enum(["en", "ar"]).optional(),
    })
    .optional(),
});

/** `GET /api/companion` — today's allowance, for the sheet's caption. */
export async function GET(): Promise<Response> {
  if (!companionConfig) return json({ error: "disabled" }, 503);
  const session = await getUserSession(await cookies());
  if (!session) return json({ error: "unauthorized" }, 401);
  const active = await loadActiveOrganization(
    db,
    session.user.id,
    session.orgId ?? null,
  );
  if (!active) return json({ error: "unauthorized" }, 401);
  const entitlements = resolveEntitlements(active.organization, {
    isAdmin: isAdminEmail(session.user.email),
  });
  return json(
    {
      used: Math.min(
        await companionUsageToday(session.user.id),
        entitlements.companionMessagesPerDay,
      ),
      limit: entitlements.companionMessagesPerDay,
    },
    200,
  );
}

/**
 * `POST /api/companion` — one turn of the in-app assistant, streamed back
 * as SSE for `useChat`. The person is whoever the session cookie says;
 * the tools run as them, in their active org, through the same service
 * calls the dashboard uses. Every turn passes the burst limiter, the
 * plan's daily allowance and the org-wide monthly cap before a single
 * token is bought.
 */
export async function POST(request: Request): Promise<Response> {
  if (!companionConfig) return json({ error: "disabled" }, 503);
  const { t } = await getT();
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;

  const session = await getUserSession(cookieStore);
  if (!session) return json({ error: t("errors.unauthorized") }, 401);
  const active = await loadActiveOrganization(
    db,
    session.user.id,
    session.orgId ?? null,
  );
  if (!active) return json({ error: t("errors.unauthorized") }, 401);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid request." }, 400);
  const body = parsed.data;
  const latest = body.messages.at(-1);
  if (
    latest?.role !== "user" ||
    typeof latest.content !== "string" ||
    latest.content.trim().length === 0 ||
    latest.content.length > MAX_MESSAGE_CHARS
  ) {
    return json({ error: t("companion.errors.tooLong") }, 400);
  }

  if (await isRateLimited(companionRatelimit, session.user.id)) {
    return json({ error: t("companion.errors.slowDown") }, 429);
  }
  const isAdmin = isAdminEmail(session.user.email);
  const entitlements = resolveEntitlements(active.organization, { isAdmin });
  const allowance = await consumeCompanionMessage({
    userId: session.user.id,
    organizationId: active.organization.id,
    dailyLimit: entitlements.companionMessagesPerDay,
    monthlyCap: companionConfig.monthlyCap,
  });
  if (!allowance.ok) {
    return json(
      {
        error:
          allowance.reason === "daily"
            ? t("companion.errors.dailyLimit", {
                limit: allowance.limit,
                when: allowance.resetsAt,
              })
            : t("companion.errors.paused"),
      },
      429,
    );
  }

  const timeZone = safeTimeZone(body.timeZone ?? body.data?.timeZone);
  const locale = body.locale ?? body.data?.locale ?? cookieLocale;
  const model = resolveModel(companionConfig.model);

  const stream = chat({
    adapter: createGeminiChat(model, companionConfig.apiKey),
    systemPrompts: [
      buildSystemPrompt({
        now: new Date(),
        timeZone,
        locale: locale === "ar" ? "ar" : "en",
        userName: session.user.name ?? session.user.email ?? "",
        organizationName: active.organization.name,
        entitlements,
      }),
    ],
    // The trimmed tail only: the model never sees more than a few turns,
    // which bounds input tokens per request no matter how long the chat.
    messages: trimHistory(body.messages) as ModelMessage[],
    tools: companionTools({
      db,
      t,
      userId: session.user.id,
      userName: session.user.name ?? "",
      organizationId: active.organization.id,
      entitlements,
      baseUrl,
    }),
    modelOptions: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.2 },
    agentLoopStrategy: maxIterations(MAX_TOOL_ROUNDS),
  });

  return toServerSentEventsResponse(stream, {
    headers: {
      "x-companion-used": String(allowance.used),
      "x-companion-limit": String(allowance.limit),
    },
  });
}

/**
 * Keeps the last few messages, starting at a user turn so a tool call is
 * never separated from its result.
 */
function trimHistory<M extends { role: string }>(messages: M[]): M[] {
  let start = Math.max(0, messages.length - MAX_HISTORY);
  while (start > 0 && messages[start]?.role !== "user") start -= 1;
  return messages.slice(start);
}

function safeTimeZone(value: string | undefined): string {
  if (!value) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

type GeminiModel = (typeof GEMINI_MODELS)[number];

/** A typo in COMPANION_MODEL falls back to the cheapest known model, loudly. */
function resolveModel(configured: string): GeminiModel {
  if ((GEMINI_MODELS as readonly string[]).includes(configured)) {
    return configured as GeminiModel;
  }
  console.warn(
    `[companion] COMPANION_MODEL "${configured}" is not a known Gemini model; using gemini-2.5-flash-lite.`,
  );
  return "gemini-2.5-flash-lite";
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}
