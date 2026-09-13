"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { XCircleIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
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

export function PlanGrantsTable() {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [includeConsumed, setIncludeConsumed] = useState(false);
  const { data, isPending } = useQuery(
    trpc.admin.grants.list.queryOptions({ includeConsumed }),
  );

  const remove = useMutation(
    trpc.admin.grants.delete.mutationOptions({
      onSuccess: () => {
        toast.success(t("admin.grants.revoked"));
        queryClient.invalidateQueries({
          queryKey: trpc.admin.grants.list.queryKey(),
        });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <div className="space-y-4">
      <Label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={includeConsumed}
          onCheckedChange={(checked) => setIncludeConsumed(checked === true)}
        />
        {t("admin.grants.showConsumed")}
      </Label>
      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState title={t("admin.grants.empty")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.grants.email")}</TableHead>
                <TableHead>{t("admin.grants.plan")}</TableHead>
                <TableHead>{t("admin.grants.seatLimit")}</TableHead>
                <TableHead>{t("admin.grants.expiresAt")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((grant) => (
                <TableRow key={grant.id}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{grant.email}</span>
                      <span className="text-xs text-muted-foreground">
                        {t("admin.grants.grantedBy", { who: grant.grantedBy })}
                        {grant.note ? ` · ${grant.note}` : ""}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <PlanBadge plan={grant.plan} />
                  </TableCell>
                  <TableCell>{grant.seatLimit}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {grant.expiresAt
                      ? t("admin.organizations.expires", {
                          when: grant.expiresAt,
                        })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-end">
                    {grant.consumedAt ? (
                      <Badge variant="success">
                        {t("admin.grants.consumed", { when: grant.consumedAt })}
                      </Badge>
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={<Button size="sm" variant="ghost" />}
                        >
                          <XCircleIcon data-icon="inline-start" />
                          {t("admin.grants.revoke")}
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t("admin.grants.revoke")}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("admin.grants.revokeConfirm")}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>
                              {t("actions.cancel")}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => remove.mutate({ id: grant.id })}
                            >
                              {t("admin.grants.revoke")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
