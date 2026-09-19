import { TRPCError } from "@trpc/server";

import type { Organization, PlanId } from "@/drizzle/schema";
import type { mainTranslations } from "@/features/core/i18n/global";
import type { TFunction } from "@/features/core/i18n/lib";

/**
 * What a plan lets an org do. Enforcement code reads *only* this shape — it
 * never asks how the org came to be on its plan (paid, comped, trial), which
 * is what lets a hand-granted `business` account behave exactly like a paid
 * one. `null` means unlimited.
 */
export type Entitlements = {
  /** Cap on people in a room at once, host included. */
  maxParticipants: number;
  maxMeetingMinutes: number | null;
  /** Cap on scheduled meetings that have not started yet. */
  maxUpcomingScheduled: number | null;
  /**
   * Cap on participant-minutes (people × minutes in a room, host included)
   * across the org per calendar month (UTC). This is what the media bill
   * scales with, so it is the one cap that keeps a free account from
   * costing more than a paid one. Checked at the join door; a meeting
   * already running is never cut off by it.
   */
  maxMonthlyParticipantMinutes: number | null;
  breakouts: boolean;
  apiAccess: boolean;
  /** Messages a person may send the AI companion per day. */
  companionMessagesPerDay: number;
  /** Seats bundled with the plan; `seatsBillable` plans add more per seat. */
  seatsIncluded: number;
  seatsBillable: boolean;
};

/**
 * For `ADMIN_EMAILS` accounts, platform-owned integrations and orgs on the
 * comp-only `unlimited` plan.
 */
export const UNLIMITED_ENTITLEMENTS: Entitlements = {
  maxParticipants: Number.MAX_SAFE_INTEGER,
  maxMeetingMinutes: null,
  maxUpcomingScheduled: null,
  maxMonthlyParticipantMinutes: null,
  breakouts: true,
  apiAccess: true,
  companionMessagesPerDay: 300,
  seatsIncluded: Number.MAX_SAFE_INTEGER,
  seatsBillable: false,
};

export const PLAN_ENTITLEMENTS: Record<PlanId, Entitlements> = {
  free: {
    maxParticipants: 5,
    maxMeetingMinutes: 40,
    maxUpcomingScheduled: 3,
    // ~ten 30-minute calls with one other person a month. Above this a
    // free account costs more in media egress than a Pro seat brings in.
    maxMonthlyParticipantMinutes: 600,
    breakouts: false,
    apiAccess: false,
    // Enough to try it, not enough to use it as a general chat bot.
    companionMessagesPerDay: 10,
    seatsIncluded: 1,
    seatsBillable: false,
  },
  pro: {
    maxParticipants: 10,
    maxMeetingMinutes: 24 * 60,
    maxUpcomingScheduled: null,
    maxMonthlyParticipantMinutes: null,
    breakouts: true,
    apiAccess: false,
    companionMessagesPerDay: 100,
    seatsIncluded: 1,
    seatsBillable: true,
  },
  business: {
    maxParticipants: 50,
    maxMeetingMinutes: 24 * 60,
    maxUpcomingScheduled: null,
    maxMonthlyParticipantMinutes: null,
    breakouts: true,
    apiAccess: true,
    companionMessagesPerDay: 100,
    seatsIncluded: 1,
    seatsBillable: true,
  },
  unlimited: UNLIMITED_ENTITLEMENTS,
};

export type PlanFacts = Pick<
  Organization,
  "plan" | "planSource" | "planExpiresAt" | "seatLimit"
>;

export type ResolvedEntitlements = Entitlements & {
  /** The plan as stored on the org. */
  plan: PlanId;
  /** The plan actually in force — `free` once a grant or grace period lapses. */
  effectivePlan: PlanId;
  planSource: Organization["planSource"];
  expired: boolean;
  seatLimit: number;
  unlimited: boolean;
};

/**
 * Expiry beats everything except admin status: an expired manual grant,
 * trial, or cancelled subscription resolves to `free` the instant it lapses,
 * with no job needed to flip the row.
 */
export function resolveEntitlements(
  org: PlanFacts,
  options: { isAdmin?: boolean; now?: Date } = {},
): ResolvedEntitlements {
  const now = options.now ?? new Date();
  const expired =
    org.planExpiresAt != null && org.planExpiresAt.getTime() <= now.getTime();

  if (options.isAdmin) {
    return {
      ...UNLIMITED_ENTITLEMENTS,
      plan: org.plan,
      effectivePlan: org.plan,
      planSource: org.planSource,
      expired,
      seatLimit: Number.MAX_SAFE_INTEGER,
      unlimited: true,
    };
  }

  const effectivePlan: PlanId = expired ? "free" : org.plan;
  const base = PLAN_ENTITLEMENTS[effectivePlan];
  const unlimited = effectivePlan === "unlimited";
  return {
    ...base,
    plan: org.plan,
    effectivePlan,
    planSource: org.planSource,
    expired,
    seatLimit: unlimited
      ? Number.MAX_SAFE_INTEGER
      : expired
        ? base.seatsIncluded
        : Math.max(org.seatLimit, 1),
    unlimited,
  };
}

export type FeatureKey = "breakouts" | "apiAccess";
export type LimitKey =
  | "maxParticipants"
  | "maxMeetingMinutes"
  | "maxUpcomingScheduled"
  | "maxMonthlyParticipantMinutes"
  | "seats";

/**
 * Attached as `cause` on the thrown TRPCError so the client can show an
 * "Upgrade" call to action keyed on *what* ran out, without parsing the
 * translated message.
 */
export class EntitlementError extends Error {
  constructor(
    readonly key: FeatureKey | LimitKey,
    readonly max?: number,
  ) {
    super(`entitlement:${key}`);
    this.name = "EntitlementError";
  }
}

type T = TFunction<typeof mainTranslations>;

export function assertEntitlement(
  t: T,
  entitlements: Entitlements,
  feature: FeatureKey,
): void;
export function assertEntitlement(
  t: T,
  entitlements: Entitlements,
  limit: Exclude<LimitKey, "seats">,
  value: number,
): void;
export function assertEntitlement(
  t: T,
  entitlements: Entitlements,
  key: FeatureKey | Exclude<LimitKey, "seats">,
  value?: number,
): void {
  switch (key) {
    case "breakouts":
      if (entitlements.breakouts) return;
      throw new TRPCError({
        code: "FORBIDDEN",
        message: t("billing.limits.breakouts"),
        cause: new EntitlementError(key),
      });
    case "apiAccess":
      if (entitlements.apiAccess) return;
      throw new TRPCError({
        code: "FORBIDDEN",
        message: t("billing.limits.apiAccess"),
        cause: new EntitlementError(key),
      });
    case "maxParticipants": {
      const max = entitlements.maxParticipants;
      // `value` is how many are already in; one more must still fit.
      if ((value ?? 0) < max) return;
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: t("billing.limits.participants", { max }),
        cause: new EntitlementError(key, max),
      });
    }
    case "maxMeetingMinutes": {
      const max = entitlements.maxMeetingMinutes;
      if (max == null || (value ?? 0) <= max) return;
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: t("billing.limits.minutes", { max }),
        cause: new EntitlementError(key, max),
      });
    }
    case "maxUpcomingScheduled": {
      const max = entitlements.maxUpcomingScheduled;
      if (max == null || (value ?? 0) < max) return;
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: t("billing.limits.upcoming", { max }),
        cause: new EntitlementError(key, max),
      });
    }
    case "maxMonthlyParticipantMinutes": {
      const max = entitlements.maxMonthlyParticipantMinutes;
      // `value` is what the month has used so far; refuse once it is spent.
      if (max == null || (value ?? 0) < max) return;
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: t("billing.limits.monthlyMinutes", { max }),
        cause: new EntitlementError(key, max),
      });
    }
  }
}

/** The UTC calendar month `now` falls in — the window a monthly cap counts. */
export function monthWindow(now: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1)),
    end: new Date(Date.UTC(year, month + 1, 1)),
  };
}

/** When a room that went live at `startedAt` must end, or `null` if never. */
export function meetingEndsAt(
  startedAt: Date,
  entitlements: Pick<Entitlements, "maxMeetingMinutes">,
): Date | null {
  if (entitlements.maxMeetingMinutes == null) return null;
  return new Date(
    startedAt.getTime() + entitlements.maxMeetingMinutes * 60_000,
  );
}

/** The shape `errorFormatter` puts on the wire. */
export type EntitlementErrorData = { key: FeatureKey | LimitKey; max?: number };

export function entitlementErrorData(
  cause: unknown,
): EntitlementErrorData | null {
  if (!(cause instanceof EntitlementError)) return null;
  return { key: cause.key, max: cause.max };
}
