import type { Metadata } from "next";
import { Suspense } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionsExport } from "@/features/admin/components/transactions-export";
import { TransactionsList } from "@/features/admin/components/transactions-list";
import { getT } from "@/features/core/i18n/server";
import { HydrateClient, prefetch, trpc } from "@/integrations/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t("admin.title")} · ${t("admin.tabs.transactions")}` };
}

export default async function AdminTransactionsPage() {
  const { t } = await getT();
  prefetch(trpc.admin.transactions.list.queryOptions({}));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.transactions.exportTitle")}</CardTitle>
          <CardDescription>
            {t("admin.transactions.exportLead")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TransactionsExport />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.transactions.title")}</CardTitle>
          <CardDescription>{t("admin.transactions.lead")}</CardDescription>
        </CardHeader>
        <CardContent>
          <HydrateClient>
            <Suspense fallback={<Skeleton className="h-48 w-full" />}>
              <TransactionsList />
            </Suspense>
          </HydrateClient>
        </CardContent>
      </Card>
    </div>
  );
}
