"use client";

import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";

import { LinkButton } from "@/components/general/link-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlanBadge } from "@/features/billing/components/plan-badge";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";
import { SearchInput } from "./search-input";

export function OrganizationsTable() {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim());
  const { data, isPending } = useQuery(
    trpc.admin.organizations.list.queryOptions({
      query: deferred || undefined,
    }),
  );

  return (
    <div className="space-y-4">
      <SearchInput value={query} onChange={setQuery} />
      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState title={t("admin.organizations.empty")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.organizations.name")}</TableHead>
                <TableHead>{t("admin.organizations.owner")}</TableHead>
                <TableHead>{t("admin.organizations.plan")}</TableHead>
                <TableHead>{t("admin.organizations.seats")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{org.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {org.isPersonal
                          ? t("admin.organizations.personal")
                          : t("admin.organizations.team")}
                        {" · "}
                        {t("admin.organizations.members", {
                          count: org.memberCount,
                        })}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {org.ownerEmail ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <PlanBadge
                        plan={org.plan}
                        planSource={org.planSource}
                        planExpiresAt={org.planExpiresAt}
                      />
                      {org.planExpiresAt && (
                        <span className="text-xs text-muted-foreground">
                          {t(
                            org.planExpiresAt.getTime() <= Date.now()
                              ? "admin.organizations.expired"
                              : "admin.organizations.expires",
                            { when: org.planExpiresAt },
                          )}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {org.memberCount} / {org.seatLimit}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-end">
                    <LinkButton
                      href={`/admin/organizations/${org.id}`}
                      size="sm"
                      variant="outline"
                    >
                      {t("admin.organizations.view")}
                    </LinkButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
