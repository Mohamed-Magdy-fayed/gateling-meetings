import { meetingInvitesRequestedEvent } from "@/integrations/inngest/functions/meeting-events";
import { sendEvents } from "@/integrations/inngest/send";
import { createTRPCRouter, protectedProcedure } from "@/integrations/trpc/init";
import { createInvites } from "./invites";
import { requireHostedMeeting } from "./meetings-router";
import { sendInvitesSchema } from "./schemas";

export const invitesRouter = createTRPCRouter({
  /** Adds invitees to an existing meeting and emails the new ones. */
  send: protectedProcedure
    .input(sendInvitesSchema)
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      const invites = await createInvites(ctx.db, meeting.id, input.emails);
      if (invites.length > 0) {
        await sendEvents(
          meetingInvitesRequestedEvent.create({
            meetingId: meeting.id,
            inviteIds: invites.map((invite) => invite.id),
          }),
        );
      }
      return { sent: invites.length };
    }),
});
