"use client";

import { CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/features/core/i18n/client";

export type IssuedCredentials = {
  apiKey: string;
  webhookSecret: string;
};

type ApiKeyDialogProps = {
  credentials: IssuedCredentials | null;
  onClose: () => void;
};

/**
 * The one moment the API key and webhook secret exist in clear. Closing is
 * deliberate (no click-outside): once dismissed they cannot be shown again,
 * only rotated.
 */
export function ApiKeyDialog({ credentials, onClose }: ApiKeyDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={credentials != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("integrations.admin.keyTitle")}</DialogTitle>
          <DialogDescription>
            {t("integrations.admin.keyLead")}
          </DialogDescription>
        </DialogHeader>
        {credentials && (
          <DialogBody className="space-y-4">
            <Secret
              id="api-key"
              label={t("integrations.admin.apiKey")}
              value={credentials.apiKey}
            />
            <Secret
              id="webhook-secret"
              label={t("integrations.admin.webhookSecret")}
              value={credentials.webhookSecret}
            />
          </DialogBody>
        )}
        <DialogFooter>
          <Button onClick={onClose}>{t("integrations.admin.done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Secret({
  id,
  label,
  value,
}: {
  id: string;
  label: string;
  value: string;
}) {
  const { t } = useTranslation();

  async function copy() {
    await navigator.clipboard.writeText(value);
    toast.success(t("integrations.admin.copied"));
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <code
          id={id}
          className="min-w-0 flex-1 break-all rounded-md bg-muted px-2 py-1.5 font-mono text-xs"
        >
          {value}
        </code>
        <Button
          variant="secondary"
          size="icon-lg"
          onClick={copy}
          aria-label={`${t("integrations.admin.copy")} ${label}`}
        >
          <CopyIcon />
        </Button>
      </div>
    </div>
  );
}
