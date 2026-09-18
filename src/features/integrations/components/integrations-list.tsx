"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import {
  KeyRoundIcon,
  PlugZapIcon,
  RefreshCwIcon,
  WebhookIcon,
  XCircleIcon,
} from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";
import type { AppRouter } from "@/integrations/trpc/routers/_app";
import { ApiKeyDialog, type IssuedCredentials } from "./api-key-dialog";

type IntegrationRow =
  inferRouterOutputs<AppRouter>["integrations"]["list"][number];

export function IntegrationsList() {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.integrations.list.queryOptions());
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<PlugZapIcon />}
        title={t("integrations.admin.empty")}
        description={t("integrations.admin.lead")}
      />
    );
  }

  return (
    <>
      <ul className="grid gap-3">
        {data.map((integration) => (
          <li key={integration.id}>
            <IntegrationCard integration={integration} onIssued={setIssued} />
          </li>
        ))}
      </ul>
      <ApiKeyDialog credentials={issued} onClose={() => setIssued(null)} />
    </>
  );
}

function IntegrationCard({
  integration,
  onIssued,
}: {
  integration: IntegrationRow;
  onIssued: (credentials: IssuedCredentials) => void;
}) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isRevoked = integration.revokedAt != null;

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.integrations.list.queryKey(),
    });

  const rotate = useMutation(
    trpc.integrations.rotateKey.mutationOptions({
      onSuccess: (result) => {
        toast.success(t("integrations.admin.rotated"));
        invalidate();
        onIssued({
          apiKey: result.apiKey,
          webhookSecret: result.webhookSecret,
        });
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const revoke = useMutation(
    trpc.integrations.revoke.mutationOptions({
      onSuccess: () => {
        toast.success(t("integrations.admin.revoked"));
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <Card>
      <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base">{integration.name}</h2>
            <Badge variant="secondary">{integration.slug}</Badge>
            {integration.organizationId == null && (
              <Badge variant="outline">
                {t("integrations.admin.scope.platform")}
              </Badge>
            )}
            <Badge variant={isRevoked ? "destructive" : "success"}>
              {isRevoked
                ? t("integrations.admin.status.revoked")
                : t("integrations.admin.status.active")}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 font-mono">
              <KeyRoundIcon className="size-3" />
              {t("integrations.admin.keyPrefix")} gm_live_
              {integration.apiKeyPrefix}…
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
              <WebhookIcon className="size-3" />
              {integration.webhookUrl ?? t("integrations.admin.noWebhook")}
            </span>
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-1">
              {integration.lastUsedAt
                ? t("integrations.admin.lastUsed", {
                    when: integration.lastUsedAt,
                  })
                : t("integrations.admin.neverUsed")}
            </span>
          </div>
          {integration.allowedReturnOrigins.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("integrations.admin.allowedReturnOrigins")}:{" "}
              {integration.allowedReturnOrigins.join(", ")}
            </p>
          )}
        </div>

        {!isRevoked && (
          <div className="flex gap-2">
            <ConfirmButton
              label={t("integrations.admin.rotateKey")}
              description={t("integrations.admin.rotateConfirm")}
              icon={<RefreshCwIcon data-icon="inline-start" />}
              variant="outline"
              pending={rotate.isPending}
              onConfirm={() => rotate.mutate({ id: integration.id })}
            />
            <ConfirmButton
              label={t("integrations.admin.revoke")}
              description={t("integrations.admin.revokeConfirm")}
              icon={<XCircleIcon data-icon="inline-start" />}
              variant="destructive"
              pending={revoke.isPending}
              onConfirm={() => revoke.mutate({ id: integration.id })}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfirmButton({
  label,
  description,
  icon,
  variant,
  pending,
  onConfirm,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  variant: "outline" | "destructive";
  pending: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant={variant} disabled={pending} />}
      >
        {icon}
        {label}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={
              variant === "destructive"
                ? "bg-destructive text-white hover:bg-destructive/90"
                : undefined
            }
            onClick={onConfirm}
          >
            {t("common.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
