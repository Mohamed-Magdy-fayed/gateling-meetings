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

/** "Pro · Granted" — the plan and, when it is not the default, how it came to be. */
export function PlanBadge({ plan, planSource, planExpiresAt }: PlanBadgeProps) {
  const { t } = useTranslation();
  const expired =
    planExpiresAt != null && planExpiresAt.getTime() <= Date.now();
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={expired ? "warning" : PLAN_VARIANT[plan]}>
        {t(`billing.plans.${plan}.name`)}
      </Badge>
      {planSource && planSource !== "free" && (
        <Badge variant="outline">{t(`billing.sources.${planSource}`)}</Badge>
      )}
    </span>
  );
}
