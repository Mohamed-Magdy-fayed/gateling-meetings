"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { ArrowLeftIcon, RotateCwIcon } from "lucide-react";
import { Suspense } from "react";
import { toast } from "sonner";

import { LinkButton } from "@/components/general/link-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanBadge } from "@/features/billing/components/plan-badge";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";
import { OrganizationPlanForm } from "./organization-plan-form";
import { TransactionsList } from "./transactions-list";

const STATUS_VARIANT = {
  scheduled: "info",
  live: "success",
  ended: "secondary",
} as const;

export function OrganizationDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const { data: org } = useSuspenseQuery(
    trpc.admin.organizations.get.queryOptions({ id }),
  );
  const queryClient = useQueryClient();
  const reprocess = useMutation(
    trpc.admin.billingEvents.reprocess.mutationOptions({
      onSuccess: () => {
        toast.success(t("admin.organizations.reprocessQueued"));
        // The function runs in the background; refresh once it has had time.
        setTimeout(() => queryClient.invalidateQueries(), 4000);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <LinkButton href="/admin" variant="ghost" size="sm">
          <ArrowLeftIcon data-icon="inline-start" className="rtl:rotate-180" />
          {t("admin.organizations.back")}
        </LinkButton>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-xl">{org.name}</h1>
          <PlanBadge
            plan={org.plan}
            planSource={org.planSource}
            planExpiresAt={org.planExpiresAt}
          />
          <Badge variant="outline">
            {org.personalOwnerId
              ? t("admin.organizations.personal")
              : t("admin.organizations.team")}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {org.ownerEmail ?? "—"} ·{" "}
          {t("admin.organizations.created", { when: org.createdAt })}
        </p>
      </div>

      <OrganizationPlanForm organization={org} />

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.transactions.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-24 w-full" />}>
            <TransactionsList organizationId={org.id} />
          </Suspense>
        </CardContent>
      </Card>

      {org.billingEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.organizations.billingEvents")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {org.billingEvents.map((event) => (
                <li
                  key={event.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs">
                      {event.eventType}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("admin.organizations.occurred", {
                        when: event.occurredAt,
                      })}
                      {event.error ? ` · ${event.error}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {event.outcome !== "applied" && event.outcome != null && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={reprocess.isPending}
                        onClick={() => reprocess.mutate({ id: event.id })}
                      >
                        <RotateCwIcon data-icon="inline-start" />
                        {t("admin.organizations.reprocess")}
                      </Button>
                    )}
                    <Badge
                      variant={
                        event.outcome === "applied"
                          ? "success"
                          : event.outcome === "error"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {event.outcome ?? t("admin.organizations.pending")}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.organizations.membersTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {org.members.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {member.user.name ?? member.user.email}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {member.user.email} ·{" "}
                      {t("admin.organizations.joined", {
                        when: member.createdAt,
                      })}
                    </div>
                  </div>
                  <Badge variant="outline">
                    {t(`organizations.roles.${member.role}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("admin.organizations.recentMeetings")}</CardTitle>
          </CardHeader>
          <CardContent>
            {org.meetings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("admin.organizations.noMeetings")}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {org.meetings.map((meeting) => (
                  <li
                    key={meeting.id}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {meeting.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {meeting.code} ·{" "}
                        {t("admin.organizations.created", {
                          when: meeting.createdAt,
                        })}
                      </div>
                    </div>
                    <Badge variant={STATUS_VARIANT[meeting.status]}>
                      {t(`meetings.dashboard.status.${meeting.status}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
