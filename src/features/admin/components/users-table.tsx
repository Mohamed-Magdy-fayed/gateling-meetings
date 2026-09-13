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

export function UsersTable() {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim());
  const { data, isPending } = useQuery(
    trpc.admin.users.list.queryOptions({ query: deferred || undefined }),
  );

  return (
    <div className="space-y-4">
      <SearchInput value={query} onChange={setQuery} />
      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState title={t("admin.users.empty")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.users.email")}</TableHead>
                <TableHead>{t("admin.users.name")}</TableHead>
                <TableHead>{t("admin.users.plan")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-2 font-medium">
                        {user.email}
                        {!user.emailVerifiedAt && (
                          <Badge variant="warning">
                            {t("admin.users.unverified")}
                          </Badge>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("admin.users.signedUp", { when: user.createdAt })}
                        {" · "}
                        {user.lastSignInAt
                          ? t("admin.users.lastSeen", {
                              when: user.lastSignInAt,
                            })
                          : t("admin.users.never")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{user.name ?? "—"}</TableCell>
                  <TableCell>
                    {user.personalOrganization ? (
                      <PlanBadge
                        plan={user.personalOrganization.plan}
                        planSource={user.personalOrganization.planSource}
                      />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-end">
                    {user.personalOrganization && (
                      <LinkButton
                        href={`/admin/organizations/${user.personalOrganization.id}`}
                        size="sm"
                        variant="outline"
                      >
                        {t("admin.users.org")}
                      </LinkButton>
                    )}
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
