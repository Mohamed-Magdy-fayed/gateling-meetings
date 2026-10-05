"use client";

import { Badge } from "@/components/ui/badge";
import type { PlanId, PlanSource } from "@/drizzle/schema";
import { useTranslation } from "@/features/core/i18n/client";

const PLAN_VARIANT = {
  free: "secondary",
  pro: "info",
  business: "success",
  unlimited: "default",
} as const;

type PlanBadgeProps = {
  plan: PlanId;
  planSource?: PlanSource;
  planExpiresAt?: Date | null;
};

/**
 * "Pro · Granted" — the plan and, when it is not the default, how it came
 * to be. Once the plan has expired (a cancelled or refunded subscription, a
 * lapsed grant) the org is on Free, so that is what the badge says, with
 * the old plan as a quiet "Business ended" note — the same rule
 * `resolveEntitlements` enforces.
 */
export function PlanBadge({ plan, planSource, planExpiresAt }: PlanBadgeProps) {
  const { t } = useTranslation();
  const expired =
    planExpiresAt != null && planExpiresAt.getTime() <= Date.now();
  if (expired && plan !== "free") {
    return (
      <span className="inline-flex items-center gap-1">
        <Badge variant={PLAN_VARIANT.free}>
          {t("billing.plans.free.name")}
        </Badge>
        <Badge variant="outline">
          {t("billing.planEnded", { plan: t(`billing.plans.${plan}.name`) })}
        </Badge>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={PLAN_VARIANT[plan]}>
        {t(`billing.plans.${plan}.name`)}
      </Badge>
      {planSource && planSource !== "free" && (
        <Badge variant="outline">{t(`billing.sources.${planSource}`)}</Badge>
      )}
    </span>
  );
}
