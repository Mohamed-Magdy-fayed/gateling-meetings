import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LinkButton } from "@/components/general/link-button";
import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { getT } from "@/features/core/i18n/server";
import { DeveloperDocs } from "@/features/integrations/components/developer-docs";
import {
  DOC_SECTIONS,
  docTitle,
  readDoc,
} from "@/features/integrations/server/docs";
import { api } from "@/integrations/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("integrations.docs.title") };
}

/**
 * The REST, webhook and MCP docs, for the same people who can see the keys:
 * owners and admins of an organization whose plan includes API access, and
 * platform admins. Everyone else gets the same 404 the Integrations tab gives.
 */
export default async function DeveloperDocsPage() {
  await getCurrentUser({ redirectIfNotFound: true });
  const [{ t }, current] = await Promise.all([
    getT(),
    api().then((caller) => caller.organizations.current()),
  ]);
  const canManage =
    current.isAdmin || current.role === "owner" || current.role === "admin";
  if (!canManage || (!current.isAdmin && !current.entitlements.apiAccess)) {
    notFound();
  }

  const pages = await Promise.all(
    DOC_SECTIONS.map(async (section) => ({
      id: section,
      title: docTitle(section),
      markdown: await readDoc(section),
    })),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl">
            {t("integrations.docs.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("integrations.docs.lead")}
          </p>
        </div>
        <LinkButton href="/settings/integrations" variant="outline">
          {t("integrations.docs.backToKeys")}
        </LinkButton>
      </div>
      <DeveloperDocs pages={pages} />
    </div>
  );
}
