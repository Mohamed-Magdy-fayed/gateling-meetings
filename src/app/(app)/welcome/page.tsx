import { PartyPopperIcon } from "lucide-react";
import type { Metadata } from "next";

import { LinkButton } from "@/components/general/link-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PlanBadge } from "@/features/billing/components/plan-badge";
import { resolveEntitlements } from "@/features/billing/plans";
import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { getT } from "@/features/core/i18n/server";
import { api } from "@/integrations/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("billing.welcome.title") };
}

/**
 * Where Paddle's checkout sends the buyer on success. Purely a greeting:
 * the plan itself lands via the webhook, which usually beats the redirect
 * but may not — so a still-free org is told the upgrade is on its way
 * rather than shown a stale "Free" as if the payment had failed.
 */
export default async function WelcomePage() {
  await getCurrentUser({ redirectIfNotFound: true });
  const [{ t }, current] = await Promise.all([
    getT(),
    api().then((caller) => caller.organizations.current()),
  ]);
  const { organization } = current;
  const { effectivePlan } = resolveEntitlements(organization);
  const isActivated = effectivePlan !== "free";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Card>
        <CardContent>
          <EmptyState
            icon={<PartyPopperIcon />}
            title={t("billing.welcome.title")}
            description={
              isActivated
                ? t("billing.welcome.leadActive", {
                    org: organization.name,
                  })
                : t("billing.welcome.leadPending", {
                    org: organization.name,
                  })
            }
            action={
              <div className="flex flex-col items-center gap-4">
                <PlanBadge
                  plan={effectivePlan}
                  planSource={organization.planSource}
                />
                <div className="flex flex-wrap justify-center gap-2">
                  <LinkButton href="/dashboard">
                    {t("billing.welcome.goToDashboard")}
                  </LinkButton>
                  <LinkButton href="/settings/billing" variant="outline">
                    {t("billing.pricing.manage")}
                  </LinkButton>
                </div>
              </div>
            }
          />
        </CardContent>
      </Card>
      {!isActivated && (
        <Alert>
          <AlertDescription>
            {t("billing.welcome.pendingNote")}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
