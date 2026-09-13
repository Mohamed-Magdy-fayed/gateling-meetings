import type { Metadata } from "next";

import { LinkButton } from "@/components/general/link-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlanBadge } from "@/features/billing/components/plan-badge";
import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { getT } from "@/features/core/i18n/server";
import { api } from "@/integrations/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("billing.settings.title") };
}

/**
 * What the active organization is on and what that allows. Checkout and
 * the customer portal arrive with Paddle; until then the only way onto a
 * paid plan is a grant from the admin panel, which is what "Talk to us"
 * leads to.
 */
export default async function BillingSettingsPage() {
  await getCurrentUser({ redirectIfNotFound: true });
  const [{ t }, current] = await Promise.all([
    getT(),
    (await api()).organizations.current(),
  ]);
  const { organization, entitlements } = current;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-xl">{t("billing.settings.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("billing.settings.lead", { name: organization.name })}
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{t("billing.settings.currentPlan")}</CardTitle>
            <PlanBadge
              plan={organization.plan}
              planSource={organization.planSource}
              planExpiresAt={organization.planExpiresAt}
            />
          </div>
          {organization.planExpiresAt && (
            <CardDescription>
              {t(
                entitlements.expired
                  ? "admin.organizations.expired"
                  : "admin.organizations.expires",
                { when: organization.planExpiresAt },
              )}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Row
              label={t("billing.settings.participants")}
              value={
                entitlements.unlimited
                  ? t("billing.settings.unlimited")
                  : String(entitlements.maxParticipants)
              }
            />
            <Row
              label={t("billing.settings.duration")}
              value={
                entitlements.maxMeetingMinutes == null
                  ? t("billing.settings.unlimited")
                  : t("billing.settings.minutes", {
                      count: entitlements.maxMeetingMinutes,
                    })
              }
            />
            <Row
              label={t("billing.settings.upcoming")}
              value={
                entitlements.maxUpcomingScheduled == null
                  ? t("billing.settings.unlimited")
                  : String(entitlements.maxUpcomingScheduled)
              }
            />
            <Row
              label={t("billing.settings.seats")}
              value={
                entitlements.unlimited
                  ? t("billing.settings.unlimited")
                  : String(entitlements.seatLimit)
              }
            />
            <Row
              label={t("billing.features.breakouts")}
              value={
                <Badge
                  variant={entitlements.breakouts ? "success" : "secondary"}
                >
                  {entitlements.breakouts ? t("common.yes") : t("common.no")}
                </Badge>
              }
            />
            <Row
              label={t("billing.settings.api")}
              value={
                <Badge
                  variant={entitlements.apiAccess ? "success" : "secondary"}
                >
                  {entitlements.apiAccess ? t("common.yes") : t("common.no")}
                </Badge>
              }
            />
          </dl>
          <div className="flex flex-wrap gap-2 pt-2">
            <LinkButton href="/pricing" variant="outline">
              {t("billing.settings.comparePlans")}
            </LinkButton>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
