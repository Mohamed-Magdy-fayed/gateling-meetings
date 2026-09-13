import type { Metadata } from "next";
import { cookies } from "next/headers";

import { LinkButton } from "@/components/general/link-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getUserSession } from "@/features/core/auth/core";
import { getT } from "@/features/core/i18n/server";
import { AcceptInvite } from "@/features/organizations/components/accept-invite";
import { api } from "@/integrations/trpc/server";

type Params = { params: Promise<{ token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("organizations.invite.title") };
}

/**
 * Where an invitation link lands. Signed out: sign in (or up) with the
 * invited address and come back here. Signed in: a preview and an Accept
 * button — the server checks the address matches before adding anyone.
 */
export default async function InvitePage({ params }: Params) {
  const { token } = await params;
  const [{ t }, session] = await Promise.all([
    getT(),
    getUserSession(await cookies()),
  ]);
  const returnTo = `/invite/${encodeURIComponent(token)}`;

  if (!session) {
    return (
      <Shell title={t("organizations.invite.title")}>
        <CardDescription>
          {t("organizations.invite.signInFirst")}
        </CardDescription>
        <div className="flex flex-wrap gap-2 pt-4">
          <LinkButton
            href={`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`}
          >
            {t("organizations.invite.signIn")}
          </LinkButton>
          <LinkButton
            href={`/auth/sign-up?returnTo=${encodeURIComponent(returnTo)}`}
            variant="outline"
          >
            {t("organizations.invite.signUp")}
          </LinkButton>
        </div>
      </Shell>
    );
  }

  const preview = await (await api()).organizations.invites.preview({ token });

  if (preview.status === "invalid") {
    return (
      <Shell title={t("organizations.invite.title")}>
        <CardDescription>{t("organizations.invite.invalid")}</CardDescription>
        <div className="pt-4">
          <LinkButton href="/dashboard" variant="outline">
            {t("common.back")}
          </LinkButton>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={t("organizations.invite.title")}>
      <CardDescription>
        {t("organizations.invite.lead", {
          inviter: preview.inviterName,
          organization: preview.organization.name,
          role: t(`organizations.roles.${preview.role}`),
        })}
      </CardDescription>
      <div className="pt-4">
        <AcceptInvite
          token={token}
          organizationName={preview.organization.name}
          wrongAccount={preview.status === "wrong-account"}
          returnTo={returnTo}
        />
      </div>
    </Shell>
  );
}

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="font-display text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
