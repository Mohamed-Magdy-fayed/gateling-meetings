"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { LinkButton } from "@/components/general/link-button";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";

type AcceptInviteProps = {
  token: string;
  organizationName: string;
  /** Signed in, but not as the invited address. */
  wrongAccount: boolean;
  returnTo: string;
};

export function AcceptInvite({
  token,
  organizationName,
  wrongAccount,
  returnTo,
}: AcceptInviteProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const router = useRouter();

  const accept = useMutation(
    trpc.organizations.invites.accept.mutationOptions({
      onSuccess: () => {
        toast.success(
          t("organizations.invite.accepted", {
            organization: organizationName,
          }),
        );
        router.push("/dashboard");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  if (wrongAccount) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">
          {t("organizations.invite.wrongAccount")}
        </p>
        <LinkButton
          href={`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`}
          variant="outline"
        >
          {t("organizations.invite.switchAccount")}
        </LinkButton>
      </div>
    );
  }

  return (
    <Button
      disabled={accept.isPending}
      onClick={() => accept.mutate({ token })}
    >
      {t("organizations.invite.accept", { organization: organizationName })}
    </Button>
  );
}
