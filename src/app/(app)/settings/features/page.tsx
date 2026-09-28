import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MeetingFeatureSwitches } from "@/features/admin/components/meeting-feature-switches";
import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { getT } from "@/features/core/i18n/server";
import { getMeetingFeatures } from "@/features/meetings/server/meeting-features";
import { api } from "@/integrations/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("admin.features.title") };
}

/**
 * Platform-wide meeting switches. Only the platform operator (the
 * `ADMIN_EMAILS` accounts — the same people who own platform
 * integrations) sees this tab; anyone else gets a 404.
 */
export default async function FeaturesPage() {
  await getCurrentUser({ redirectIfNotFound: true });
  const [{ t }, current] = await Promise.all([
    getT(),
    api().then((caller) => caller.organizations.current()),
  ]);
  if (!current.isAdmin) notFound();
  const features = await getMeetingFeatures();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.features.title")}</CardTitle>
        <CardDescription>{t("admin.features.lead")}</CardDescription>
      </CardHeader>
      <CardContent>
        <MeetingFeatureSwitches initial={features} />
      </CardContent>
    </Card>
  );
}
