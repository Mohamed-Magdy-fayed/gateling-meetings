import type { Metadata } from "next";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PasskeyManager } from "@/features/core/auth/nextjs/components/passkey-manager";
import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { getT } from "@/features/core/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("settings.tabs.account") };
}

/** The person, not the organization: who is signed in and how they sign in. */
export default async function AccountSettingsPage() {
  const user = await getCurrentUser({ redirectIfNotFound: true });
  const { t } = await getT();
  const displayName = user.name ?? user.email ?? "";
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-xl">{t("settings.account.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("settings.account.lead")}
        </p>
      </div>

      <Card>
        <CardContent className="flex items-center gap-4">
          <Avatar className="size-12">
            <AvatarFallback className="bg-accent font-display text-base font-bold text-accent-foreground">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            {user.name && user.email && (
              <p className="truncate text-sm text-muted-foreground">
                {user.email}
              </p>
            )}
          </div>
          <Badge variant={user.emailVerifiedAt ? "success" : "warning"}>
            {user.emailVerifiedAt
              ? t("settings.account.verified")
              : t("settings.account.unverified")}
          </Badge>
        </CardContent>
      </Card>

      <PasskeyManager />
    </div>
  );
}
