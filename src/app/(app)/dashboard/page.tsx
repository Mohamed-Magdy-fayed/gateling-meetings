import { and, eq, isNull } from "drizzle-orm";
import { CalendarPlusIcon } from "lucide-react";
import { Suspense } from "react";

import { LinkButton } from "@/components/general/link-button";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/drizzle";
import { MeetingsTable } from "@/drizzle/schema";
import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { getT } from "@/features/core/i18n/server";
import { JoinByCodeForm } from "@/features/meetings/components/join-by-code-form";
import { MeetingList } from "@/features/meetings/components/meeting-list";
import { NewMeetingButton } from "@/features/meetings/components/new-meeting-button";
import { PersonalRoomCard } from "@/features/meetings/components/personal-room-card";
import { HydrateClient, prefetch, trpc } from "@/integrations/trpc/server";

export default async function DashboardPage() {
  const user = await getCurrentUser({ redirectIfNotFound: true });
  const { t } = await getT();
  prefetch(trpc.meetings.listMine.queryOptions());

  const personalRoom = await db.query.MeetingsTable.findFirst({
    where: and(
      eq(MeetingsTable.hostId, user.id),
      eq(MeetingsTable.isPersonalRoom, true),
      isNull(MeetingsTable.deletedAt),
    ),
    columns: { code: true },
  });

  return (
    <div className="space-y-8">
      {/* On phones the bottom bar already carries these three; the row would only repeat it. */}
      <div className="hidden gap-4 md:flex md:flex-row md:items-center">
        <NewMeetingButton className="h-10" />
        <LinkButton
          href="/schedule"
          variant="outline"
          size="lg"
          className="h-10"
        >
          <CalendarPlusIcon data-icon="inline-start" />
          {t("meetings.sections.schedule")}
        </LinkButton>
        <JoinByCodeForm className="sm:ms-auto sm:max-w-md" />
      </div>

      <PersonalRoomCard code={personalRoom?.code ?? null} />

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
