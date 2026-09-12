import { UnlinkIcon } from "lucide-react";
import type { Metadata } from "next";

import { LinkButton } from "@/components/general/link-button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LanguageToggle } from "@/features/core/i18n/client";
import { getT } from "@/features/core/i18n/server";

const REASONS = ["expired", "used", "invalid"] as const;
type Reason = (typeof REASONS)[number];

function toReason(value: string | undefined): Reason {
  return REASONS.includes(value as Reason) ? (value as Reason) : "invalid";
}

type Props = { searchParams: Promise<{ reason?: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("integrations.sso.title"), robots: { index: false } };
}

/**
 * Where `/sso/join` sends a link it cannot honour. Deliberately says
 * nothing about *which* integration or meeting — the person should go back
 * to the system that sent them and ask it for a fresh link.
 */
export default async function SsoErrorPage({ searchParams }: Props) {
  const [{ t }, { reason }] = await Promise.all([getT(), searchParams]);
  const key = toReason(reason);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-muted p-6">
      <div className="w-full max-w-sm space-y-3">
        <div className="flex justify-end">
          <LanguageToggle />
        </div>
        <Card>
          <CardContent className="p-2">
            <EmptyState
              icon={<UnlinkIcon />}
              title={t("integrations.sso.title")}
              description={t(`integrations.sso.reasons.${key}`)}
              action={
                <LinkButton href="/" variant="outline">
                  {t("integrations.sso.backHome")}
                </LinkButton>
              }
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
