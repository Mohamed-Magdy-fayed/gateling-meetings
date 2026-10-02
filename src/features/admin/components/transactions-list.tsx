"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney } from "@/features/billing/components/format-money";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";

/**
 * The ledger as the operator needs it when a customer asks for a refund:
 * what was charged, on which card, what has already gone back, and
 * whether Paymob will still accept a refund (90 days from the charge).
 */
export function TransactionsList({
  organizationId,
}: {
  organizationId?: string;
}) {
  const { t, locale } = useTranslation();
  const trpc = useTRPC();
  const { data: rows } = useSuspenseQuery(
    trpc.admin.transactions.list.queryOptions({ organizationId }),
  );

  if (rows.length === 0) {
    return <EmptyState title={t("admin.transactions.empty")} />;
  }

  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => {
        const isPayment = row.kind === "payment";
        const isLivePayment = isPayment && row.status === "succeeded";
        const fullyReversed =
          row.voidedAt != null || row.refundedAmountCents >= row.amountCents;
        return (
          <li
            key={row.id}
            className="flex flex-wrap items-start justify-between gap-3 py-2 text-sm"
          >
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium tabular-nums">
                  {formatMoney(row.amountCents, row.currency, locale)}
                </span>
                <Badge variant={isPayment ? "outline" : "warning"}>
                  {t(`admin.transactions.kind.${row.kind}`)}
                </Badge>
                {row.status === "failed" && (
                  <Badge variant="destructive">
                    {t("admin.transactions.failed")}
                  </Badge>
                )}
                {!organizationId && row.organizationName && (
                  <span className="truncate text-muted-foreground">
                    {row.organizationName}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("admin.transactions.date", { when: row.occurredAt })} ·{" "}
                <span dir="ltr" className="font-mono">
                  {row.providerTransactionId}
                </span>
                {row.cardLast4 && (
                  <>
                    {" · "}
                    <span dir="ltr">
                      {row.cardBrand ?? ""} •••• {row.cardLast4}
                    </span>
                  </>
                )}
                {row.status === "succeeded" && !row.receiptSentAt && (
                  <> · {t("admin.transactions.noReceipt")}</>
                )}
              </div>
            </div>
            {isLivePayment && (
              <div className="flex flex-wrap items-center gap-2">
                {row.voidedAt ? (
                  <Badge variant="secondary">
                    {t("admin.transactions.voided")}
                  </Badge>
                ) : row.refundedAmountCents > 0 ? (
                  <Badge variant="secondary">
                    {t("admin.transactions.refunded", {
                      amount: formatMoney(
                        row.refundedAmountCents,
                        row.currency,
                        locale,
                      ),
                    })}
                  </Badge>
                ) : null}
                {!fullyReversed &&
                  (row.refundWindowClosed ? (
                    <Badge variant="destructive">
                      {t("admin.transactions.refundClosed")}
                    </Badge>
                  ) : (
                    <Badge variant="info">
                      {t("admin.transactions.refundBy", {
                        when: row.refundDeadline,
                      })}
                    </Badge>
                  ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
