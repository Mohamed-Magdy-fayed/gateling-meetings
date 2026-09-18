import type { PropsWithChildren } from "react";
import { Suspense } from "react";

import { BrandLockup } from "@/components/brand/brand-lockup";
import { BuiltByGateling } from "@/components/brand/built-by-gateling";
import { BackLink } from "@/components/general/back-link";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/features/core/color-theme/client";
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
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <LanguageToggle />
      </div>
    </div>
  );
}

export default function AuthLayout({ children }: PropsWithChildren) {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-muted p-6">
      {/* The same warm glow as the landing hero, so sign-in feels like the same place. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -start-40 size-[28rem] rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative flex w-full max-w-sm flex-col items-center gap-6">
        <BrandLockup size="hero" />
        <Card className="w-full">
          <CardContent className="space-y-4 p-6">
            <Suspense>
              <AuthNav />
            </Suspense>
            {children}
          </CardContent>
        </Card>
        <BuiltByGateling />
      </div>
    </div>
  );
}
