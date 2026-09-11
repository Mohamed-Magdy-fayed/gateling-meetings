"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { beginEmailVerificationAction } from "@/features/core/auth/nextjs/actions";
import { useAuth } from "@/features/core/auth/nextjs/components/auth-provider";
import { useTranslation } from "@/features/core/i18n/client";

export function EmailVerificationNotice() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [isPending, startTransition] = useTransition();

  if (!auth.isAuthenticated) return null;

  const { user } = auth.session;

  if (user.emailVerifiedAt) {
    return (
      <Status variant="success">
        <StatusIndicator />
        <StatusLabel>
          {t("auth.emailVerification.alreadyVerifiedNote")}
        </StatusLabel>
      </Status>
    );
  }

  if (!user.email) {
    return (
      <Status variant="warning">
        <StatusIndicator />
        <StatusLabel>
          {t("auth.emailVerification.notice.missingEmail")}
        </StatusLabel>
      </Status>
    );
  }

  return (
    <div className="space-y-4">
      <Status variant="error">
        <StatusIndicator />
        <StatusLabel>{t("auth.emailVerification.heading")}</StatusLabel>
      </Status>
      <Button
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            const res = await beginEmailVerificationAction();
            if (res.isError) {
              toast.error(
                res.message ?? t("auth.emailVerification.error.sendFailed"),
              );
              return;
            }
            toast.success(t("auth.emailVerification.sent"));
          });
        }}
        type="button"
      >
        {isPending
          ? t("auth.emailVerification.notice.sending")
          : t("auth.emailVerification.notice.sendButton")}
      </Button>
    </div>
  );
}
