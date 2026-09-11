import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { getT } from "@/features/core/i18n/server";
import { JoinByCodeForm } from "@/features/meetings/components/join-by-code-form";
import { MeetingList } from "@/features/meetings/components/meeting-list";
import { NewMeetingButton } from "@/features/meetings/components/new-meeting-button";
import { HydrateClient, prefetch, trpc } from "@/integrations/trpc/server";

export default async function DashboardPage() {
  await getCurrentUser({ redirectIfNotFound: true });
  const { t } = await getT();
  prefetch(trpc.meetings.listMine.queryOptions());

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <NewMeetingButton className="h-10" />
        <JoinByCodeForm className="sm:max-w-md" />
      </div>

      <section className="space-y-3">
        <h1 className="font-display text-xl">
          {t("meetings.dashboard.title")}
        </h1>
        <HydrateClient>
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <MeetingList />
          </Suspense>
        </HydrateClient>
      </section>
    </div>
  );
}
