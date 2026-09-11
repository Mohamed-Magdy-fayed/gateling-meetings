import type { PropsWithChildren } from "react";
import { Suspense } from "react";

import { BackLink } from "@/components/general/back-link";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageToggle } from "@/features/core/i18n/client";
import { getT } from "@/features/core/i18n/server";

async function AuthNav() {
  const { t } = await getT();
  return (
    <div className="flex items-center justify-between gap-2">
      <BackLink
        className="ps-0"
        href="/"
        text={t("auth.backToHome")}
        variant="link"
      />
      <LanguageToggle />
    </div>
  );
}

export default function AuthLayout({ children }: PropsWithChildren) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6">
      <div className="w-full max-w-sm">
        <Card>
          <CardContent className="space-y-4 p-6">
            <Suspense>
              <AuthNav />
            </Suspense>
            {children}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
