import { H3, Muted } from "@/components/ui/typography";
import { PasskeyManager } from "@/features/core/auth/nextjs/components/passkey-manager";
import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { getT } from "@/features/core/i18n/server";

// Reachable from the dashboard sidebar's user menu (phase-02 step 8) and
// from the post-verify passkey prompt (phase-02 step 7).
export default async function PasskeysPage() {
  await getCurrentUser({ redirectIfNotFound: true });
  const { t } = await getT();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <H3>{t("auth.passkeys.pageTitle")}</H3>
        <Muted>{t("auth.passkeys.pageDescription")}</Muted>
      </div>
      <PasskeyManager />
    </div>
  );
}
