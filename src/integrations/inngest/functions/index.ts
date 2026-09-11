import { processTask } from "./example";
import { onLiveKitWebhook } from "./on-livekit-webhook";
import { onUserRegistered } from "./on-user-registered";

export const functions = [processTask, onUserRegistered, onLiveKitWebhook];
