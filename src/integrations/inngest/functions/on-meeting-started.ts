import { db } from "@/drizzle";
import { mainTranslations } from "@/features/core/i18n/global";
import { createI18n } from "@/features/core/i18n/lib";
import { findMeetingById } from "@/features/meetings/server/queries";
import { endMeeting } from "@/features/meetings/server/service";
import { inngest } from "../client";
import { meetingStartedEvent } from "./meeting-events";

const SYSTEM_ACTOR = "system:duration-cap";

/**
 * The plan's meeting-length cap, enforced. Armed by `meeting/started` with
 * the instant the owning org's plan says the room must close; sleeps until
 * then and ends the meeting if it is still the *same* session. `cancelOn`
 * disarms it when the room closes for any other reason (host ended it,
 * everyone left, a personal room's session finished), and the
 * `startedAt` check catches a personal room that closed and reopened
 * without the cancel arriving first — its new session has its own timer.
 *
 * The countdown warning is the client's job (`DurationBanner`), which can
 * render it in the viewer's language; the server only pulls the plug.
 */
export const enforceMeetingDuration = inngest.createFunction(
  {
    id: "enforce-meeting-duration",
    triggers: [meetingStartedEvent],
    cancelOn: [{ event: "meeting/ended", match: "data.meetingId" }],
  },
  async ({ event, step }) => {
    if (!event.data.endsAt) return { skipped: "unlimited" };

    await step.sleepUntil("until-cap", new Date(event.data.endsAt));

    const stillLive = await step.run("check-still-live", async () => {
      const meeting = await findMeetingById(db, event.data.meetingId);
      return (
        meeting != null &&
        meeting.status === "live" &&
        meeting.startedAt?.toISOString() === event.data.startedAt
      );
    });
    if (!stillLive) return { skipped: "stale" };

    await step.run("end-meeting", async () => {
      const meeting = await findMeetingById(db, event.data.meetingId);
      if (!meeting) return;
      const { t } = createI18n(mainTranslations, "en", "en");
      await endMeeting({ db, t }, meeting, SYSTEM_ACTOR);
    });
    return { ended: true };
  },
);
