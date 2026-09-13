"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { LinkButton } from "@/components/general/link-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";
import { CheckoutButton } from "./checkout-button";
import { PlanBadge } from "./plan-badge";
import { SeatStepper } from "./seat-stepper";

export function BillingSummary() {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(trpc.billing.summary.queryOptions());
  const { organization, entitlements, seatsUsed, subscription } = data;
  const [seats, setSeats] = useState(Math.max(organization.seatLimit, 1));

  const onError = (error: { message: string }) => toast.error(error.message);
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.billing.summary.queryKey(),
    });

  const portal = useMutation(
    trpc.billing.portalUrl.mutationOptions({
      onSuccess: ({ overview }) => window.open(overview, "_blank", "noopener"),
      onError,
    }),
  );
  const updateSeats = useMutation(
    trpc.billing.updateSeats.mutationOptions({
      onSuccess: () => {
        toast.success(t("billing.settings.seatsUpdated"));
        invalidate();
      },
      onError,
    }),
  );
  const cancel = useMutation(
    trpc.billing.cancel.mutationOptions({
      onSuccess: () => {
        toast.success(t("billing.settings.cancelled"));
        invalidate();
      },
      onError,
    }),
  );

  return (
    <div className="space-y-6">
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
          {subscription?.status && (
            <CardDescription>
              {t("billing.settings.subscriptionStatus", {
                status: subscription.status,
              })}
              {subscription.currentPeriodEndsAt &&
                ` · ${t("billing.settings.renews", { when: subscription.currentPeriodEndsAt })}`}
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
                  : `${seatsUsed} / ${entitlements.seatLimit}`
              }
            />
            <Row
              label={t("billing.features.breakouts")}
              value={<YesNo value={entitlements.breakouts} />}
            />
            <Row
              label={t("billing.settings.api")}
              value={<YesNo value={entitlements.apiAccess} />}
            />
          </dl>
          <div className="flex flex-wrap gap-2 pt-2">
            <LinkButton href="/pricing" variant="outline">
              {t("billing.settings.comparePlans")}
            </LinkButton>
            {data.canManage && (
              <Button
                variant="outline"
                disabled={portal.isPending}
                onClick={() => portal.mutate()}
              >
                {t("billing.pricing.manage")}
                <ExternalLinkIcon data-icon="inline-end" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {data.canCheckout && (
        <Card>
          <CardHeader>
            <CardTitle>{t("billing.settings.upgradeTitle")}</CardTitle>
            <CardDescription>
              {t("billing.settings.upgradeLead")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SeatStepper
              value={seats}
              min={Math.max(seatsUsed, 1)}
              onChange={setSeats}
            />
            <div className="flex flex-wrap gap-2">
              <CheckoutButton plan="pro" seats={seats}>
                {t("billing.settings.choose", {
                  plan: t("billing.plans.pro.name"),
                })}
              </CheckoutButton>
              <CheckoutButton plan="business" seats={seats} variant="outline">
                {t("billing.settings.choose", {
                  plan: t("billing.plans.business.name"),
                })}
              </CheckoutButton>
            </div>
          </CardContent>
        </Card>
      )}

      {data.canManage && organization.planSource === "subscription" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("billing.settings.seatsTitle")}</CardTitle>
            <CardDescription>{t("billing.settings.seatsLead")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SeatStepper
              value={seats}
              min={Math.max(seatsUsed, 1)}
              onChange={setSeats}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  updateSeats.isPending || seats === organization.seatLimit
                }
                onClick={() => updateSeats.mutate({ seats })}
              >
                {t("billing.settings.updateSeats")}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="ghost" />}>
                  {t("billing.settings.cancel")}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("billing.settings.cancel")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("billing.settings.cancelConfirm")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => cancel.mutate()}>
                      {t("billing.settings.cancel")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      )}
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

function YesNo({ value }: { value: boolean }) {
  const { t } = useTranslation();
  return (
    <Badge variant={value ? "success" : "secondary"}>
      {value ? t("common.yes") : t("common.no")}
    </Badge>
  );
}
