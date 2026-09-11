import { processTask } from "./example";
import { onLiveKitWebhook } from "./on-livekit-webhook";
import { onMeetingInvitesRequested } from "./on-meeting-invites-requested";
import { onMeetingScheduled } from "./on-meeting-scheduled";
import { onUserRegistered } from "./on-user-registered";

export const functions = [
  processTask,
  onUserRegistered,
  onLiveKitWebhook,
  onMeetingInvitesRequested,
  onMeetingScheduled,
];
