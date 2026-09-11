import { HomeIcon, KeyRoundIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LinkButton } from "@/components/general/link-button";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { H3 } from "@/components/ui/typography";
import { getAuth } from "@/features/core/auth/nextjs/actions";
import { verifyEmailTokenAction } from "@/features/core/auth/nextjs/actions/email";
import { AuthProvider } from "@/features/core/auth/nextjs/components/auth-provider";
import { EmailVerificationNotice } from "@/features/core/auth/nextjs/components/email-verification-notice";
import { isSafeReturnTo } from "@/features/core/auth/nextjs/lib/post-auth-redirect";
import { getT } from "@/features/core/i18n/server";

type VerifyEmailPageProps = {
  searchParams: Promise<{ token?: string; returnTo?: string }>;
};

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const { t } = await getT();
  const { token, returnTo } = await searchParams;

  return (
    <div className="space-y-4">
      <H3>{t("auth.emailVerification.heading")}</H3>
      <Suspense
        fallback={
          <Status variant="default">
            <StatusIndicator />
            <StatusLabel>{t("common.loading")}</StatusLabel>
          </Status>
        }
      >
        <VerifyEmailBody token={token} returnTo={returnTo} />
      </Suspense>
      <LinkButton href="/">
        <HomeIcon />
        {t("auth.emailVerification.backHome")}
      </LinkButton>
    </div>
  );
}

async function VerifyEmailBody({
  token,
  returnTo,
}: {
  token?: string;
  returnTo?: string;
}) {
  const { t } = await getT();

  if (token) {
    const result = await verifyEmailTokenAction({ token });

    // e.g. an invite link that routed a brand-new visitor through sign-up —
    // send them back to finish accepting it instead of stranding them on a
    // static "verified" message (STATE.md D49).
    if (!result.isError && isSafeReturnTo(returnTo)) {
      redirect(returnTo);
    }

    return (
      <div className="space-y-4">
        <Status variant={result.isError ? "error" : "success"}>
          <StatusIndicator />
          <StatusLabel>
            {result.isError
              ? result.message
              : t("auth.emailVerification.success.verified")}
          </StatusLabel>
        </Status>
        {!result.isError ? (
          // Post-verify optional passkey prompt (phase-02.md step 7) —
          // skippable, straight to the dashboard either way.
          <div className="flex flex-col gap-2 sm:flex-row">
            <LinkButton href="/auth/passkeys" className="flex-1">
              <KeyRoundIcon />
              {t("auth.emailVerification.passkeyPrompt.setUp")}
            </LinkButton>
            <LinkButton href="/dashboard" variant="outline" className="flex-1">
              {t("auth.emailVerification.passkeyPrompt.skip")}
            </LinkButton>
          </div>
        ) : null}
      </div>
    );
  }

  const auth = await getAuth();
  if (!auth.isAuthenticated) {
    return (
      <Status variant="warning">
        <StatusIndicator />
        <StatusLabel>
          {t("auth.emailVerification.notice.signInRequired")}
        </StatusLabel>
      </Status>
    );
  }

  return (
    <AuthProvider value={auth}>
      <EmailVerificationNotice />
    </AuthProvider>
  );
}
