"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";

import { LinkButton } from "@/components/general/link-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanBadge } from "@/features/billing/components/plan-badge";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";
import { OrganizationPlanForm } from "./organization-plan-form";

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
