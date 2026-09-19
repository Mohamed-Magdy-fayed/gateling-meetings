import { deliverWebhook } from "./deliver-webhook";
import { endIdleMeetings } from "./end-idle-meetings";
import { processTask } from "./example";
import { onBillingWebhook } from "./on-billing-webhook";
import { onLiveKitWebhook } from "./on-livekit-webhook";
import { onMeetingInvitesRequested } from "./on-meeting-invites-requested";
import { onMeetingScheduled } from "./on-meeting-scheduled";
import { enforceMeetingDuration } from "./on-meeting-started";
import { onOrganizationInvite } from "./on-organization-invite";
import { onUserRegistered } from "./on-user-registered";

export const functions = [
  processTask,
  onUserRegistered,
  onLiveKitWebhook,
  onMeetingInvitesRequested,
  onMeetingScheduled,
  enforceMeetingDuration,
  deliverWebhook,
  onBillingWebhook,
  onOrganizationInvite,
  endIdleMeetings,
];
