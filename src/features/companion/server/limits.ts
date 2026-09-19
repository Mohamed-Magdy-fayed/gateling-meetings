import "server-only";

import { redisClient } from "@/integrations/redis";
import { dayKey, monthKey, nextDailyReset } from "../lib/allowance";

/**
 * The companion's spend controls, all server-side, all in Redis so every
 * instance sees the same counts. Two counters: a per-person daily
 * allowance (the plan decides how many), and an org-wide monthly ceiling
 * that is a kill switch, not a feature — it exists so a bug or a burst can
 * never turn into a bill.
 */
const DAY_TTL_SECONDS = 36 * 60 * 60;
const MONTH_TTL_SECONDS = 40 * 24 * 60 * 60;

export type AllowanceCheck =
  | { ok: true; used: number; limit: number }
  | { ok: false; reason: "daily"; used: number; limit: number; resetsAt: Date }
  | { ok: false; reason: "monthly" };

/**
 * Counts this message against both budgets and says whether it may run.
 * The increments happen first and are not rolled back on refusal: a
 * refused message still cost a request, and it keeps the arithmetic
 * atomic without a Lua script.
 */
export async function consumeCompanionMessage(input: {
  userId: string;
  organizationId: string;
  dailyLimit: number;
  monthlyCap: number;
  now?: Date;
}): Promise<AllowanceCheck> {
  const now = input.now ?? new Date();
  const dailyKeyName = `companion:day:${input.userId}:${dayKey(now)}`;
  const monthlyKeyName = `companion:month:${input.organizationId}:${monthKey(now)}`;

  const [used, monthly] = await Promise.all([
    redisClient.incr(dailyKeyName),
    redisClient.incr(monthlyKeyName),
  ]);
  // Fresh keys get their expiry once; a repeated EXPIRE is harmless.
  if (used === 1) await redisClient.expire(dailyKeyName, DAY_TTL_SECONDS);
  if (monthly === 1) {
    await redisClient.expire(monthlyKeyName, MONTH_TTL_SECONDS);
  }

  if (monthly > input.monthlyCap) return { ok: false, reason: "monthly" };
  if (used > input.dailyLimit) {
    return {
      ok: false,
      reason: "daily",
      used: input.dailyLimit,
      limit: input.dailyLimit,
      resetsAt: nextDailyReset(now),
    };
  }
  return { ok: true, used, limit: input.dailyLimit };
}

/** How much of today's allowance is gone, for the "{n} of {limit}" caption. */
export async function companionUsageToday(
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const value = await redisClient.get<number>(
    `companion:day:${userId}:${dayKey(now)}`,
  );
  return Number(value ?? 0);
}
