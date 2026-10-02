import { DownloadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getT } from "@/features/core/i18n/server";

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * A plain GET form: the browser downloads the CSV straight from the
 * admin-only route, so no data passes through client state.
 */
export async function TransactionsExport() {
  const { t } = await getT();
  const today = new Date();
  const monthStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
  );
  return (
    <form
      method="get"
      action="/api/admin/billing/transactions"
      className="flex flex-wrap items-end gap-3"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="tx-from">{t("admin.transactions.from")}</Label>
        <Input
          id="tx-from"
          name="from"
          type="date"
          required
          defaultValue={isoDate(monthStart)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tx-to">{t("admin.transactions.to")}</Label>
        <Input
          id="tx-to"
          name="to"
          type="date"
          required
          defaultValue={isoDate(today)}
        />
      </div>
      <Button type="submit" variant="outline">
        <DownloadIcon data-icon="inline-start" />
        {t("admin.transactions.download")}
      </Button>
    </form>
  );
}
