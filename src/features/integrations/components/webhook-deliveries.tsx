"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { WebhookIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";

const STATUS_VARIANT = {
  pending: "info",
  delivered: "success",
  failed: "destructive",
} as const;

/** Refetches while something is still pending so a delivery flips live. */
const PENDING_REFETCH_MS = 5_000;

export function WebhookDeliveries() {
  const { t, locale } = useTranslation();
  const trpc = useTRPC();
  const { data } = useSuspenseQuery({
    ...trpc.integrations.deliveries.queryOptions({}),
    refetchInterval: (query) =>
      query.state.data?.some((row) => row.status === "pending")
        ? PENDING_REFETCH_MS
        : false,
  });

  if (data.length === 0) {
    return (
      <EmptyState
        compact
        icon={<WebhookIcon />}
        title={t("integrations.admin.noDeliveries")}
      />
    );
  }

  const when = new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("integrations.admin.delivery.when")}</TableHead>
            <TableHead>{t("integrations.admin.name")}</TableHead>
            <TableHead>{t("integrations.admin.delivery.event")}</TableHead>
            <TableHead>{t("integrations.admin.delivery.status")}</TableHead>
            <TableHead className="text-end">
              {t("integrations.admin.delivery.attempts")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {when.format(row.createdAt)}
              </TableCell>
              <TableCell>{row.integration.name}</TableCell>
              <TableCell className="font-mono text-xs">{row.event}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <Badge variant={STATUS_VARIANT[row.status]}>
                    {t(`integrations.admin.delivery.statuses.${row.status}`)}
                  </Badge>
                  {row.lastError && row.status !== "delivered" && (
                    <span className="max-w-xs truncate text-xs text-muted-foreground">
                      {row.lastError}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-end tabular-nums">
                {row.attempts}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
