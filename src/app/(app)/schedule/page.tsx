import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { getT } from "@/features/core/i18n/server";
import { ScheduleMeetingForm } from "@/features/meetings/components/schedule-meeting-form";

export default async function SchedulePage() {
  await getCurrentUser({ redirectIfNotFound: true });
  const { t } = await getT();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl">
          {t("meetings.schedule.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("meetings.schedule.lead")}
        </p>
      </div>
      <ScheduleMeetingForm />
    </div>
  );
}
