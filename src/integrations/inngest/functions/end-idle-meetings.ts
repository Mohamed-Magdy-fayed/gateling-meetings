import { and, eq, isNull, lt, or } from "drizzle-orm";

import { db } from "@/drizzle";
import { MeetingsTable } from "@/drizzle/schema";
import { countActiveParticipants } from "@/features/billing/server/usage";
import { mainTranslations } from "@/features/core/i18n/global";
import { createI18n } from "@/features/core/i18n/lib";
import { idleCutoff, isIdleSince } from "@/features/meetings/lib/idle";
import { findMeetingById } from "@/features/meetings/server/queries";
import { endMeeting } from "@/features/meetings/server/service";
import { getRoomService } from "@/integrations/livekit/client";
import { inngest } from "../client";

const SYSTEM_ACTOR = "system:idle";
/** Per tick; a backlog drains over the next ticks rather than in one long run. */
const BATCH = 100;

/**
 * Ends live meetings nobody is in any more. LiveKit already closes an
 * emptied room after a few minutes and `room_finished` marks the meeting
 * ended; this sweep catches what that misses — an instant meeting that was
 * created and never joined (no room ever existed), or a webhook that never
 * arrived — so "In progress" cannot show yesterday's meetings. Personal
 * rooms are permanent links and are never touched.
 *
 * A meeting is only ended once *both* the app's participant log and
 * LiveKit itself say the room is empty; anything occupied is skipped and
 * looked at again next tick.
 */
export const endIdleMeetings = inngest.createFunction(
  { id: "end-idle-meetings", triggers: [{ cron: "*/10 * * * *" }] },
  async ({ step }) => {
    const candidates = await step.run("find-idle", async () => {
      const cutoff = idleCutoff(new Date());
      const rows = await db.query.MeetingsTable.findMany({
        where: and(
          eq(MeetingsTable.status, "live"),
          eq(MeetingsTable.isPersonalRoom, false),
          isNull(MeetingsTable.deletedAt),
          or(
            lt(MeetingsTable.startedAt, cutoff),
            and(
              isNull(MeetingsTable.startedAt),
              lt(MeetingsTable.createdAt, cutoff),
            ),
          ),
        ),
        columns: { id: true, code: true },
        limit: BATCH,
      });
      return rows.map((row) => row.id);
    });

    let ended = 0;
    let occupied = 0;
    for (const meetingId of candidates) {
      const result = await step.run(`sweep-${meetingId}`, async () => {
        // Re-read inside the step: the row may have moved on since the scan.
        const meeting = await findMeetingById(db, meetingId);
        if (!meeting || !isIdleSince(meeting, new Date())) return "stale";
        if ((await countActiveParticipants(db, meeting.id)) > 0) {
          return "occupied";
        }
        try {
          const inRoom = await getRoomService().listParticipants(meeting.code);
          if (inRoom.length > 0) return "occupied";
        } catch {
          // Room never created (404) or LiveKit unreachable: nobody is in it.
        }
        const { t } = createI18n(mainTranslations, "en", "en");
        await endMeeting({ db, t }, meeting, SYSTEM_ACTOR);
        return "ended";
      });
      if (result === "ended") ended += 1;
      if (result === "occupied") occupied += 1;
    }
    return { scanned: candidates.length, ended, occupied };
  },
);
