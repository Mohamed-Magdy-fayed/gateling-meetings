import { TRPCError } from "@trpc/server";
import { notFound } from "next/navigation";

import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { getT } from "@/features/core/i18n/server";
import { ScheduleMeetingForm } from "@/features/meetings/components/schedule-meeting-form";
import { normalizeMeetingCode } from "@/features/meetings/lib/meeting-code";
import { api } from "@/integrations/trpc/server";

type Props = { params: Promise<{ code: string }> };

export default async function EditMeetingPage({ params }: Props) {
  await getCurrentUser({ redirectIfNotFound: true });
  const { t } = await getT();
  const { code: raw } = await params;
  const code = normalizeMeetingCode(raw);
  if (!code) notFound();

  const caller = await api();
  let meeting: Awaited<ReturnType<typeof caller.meetings.getForHost>>;
  try {
    meeting = await caller.meetings.getForHost({ code });
  } catch (error) {
    if (error instanceof TRPCError) notFound();
    throw error;
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="font-display text-2xl">{t("meetings.detail.edit")}</h1>
      <ScheduleMeetingForm
        existing={{
          code: meeting.code,
          title: meeting.title,
          scheduledAt: meeting.scheduledAt,
          durationMinutes: meeting.durationMinutes,
          timezone: meeting.timezone,
          waitingRoom: meeting.settings.waitingRoom,
        }}
      />
    </div>
  );
}
