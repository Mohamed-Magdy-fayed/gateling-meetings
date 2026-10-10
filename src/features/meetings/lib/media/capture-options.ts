import type { AudioCaptureOptions } from "livekit-client";

/**
 * Voice processing for every microphone we open (lobby preview and room),
 * so the two never differ.
 *
 * Every switch is spelled out rather than left to browser defaults. Echo
 * cancellation is what keeps a phone on loudspeaker from feeding the room
 * back to itself. Voice isolation is a hint: browsers and OSes that support
 * it apply it, others ignore it.
 */
export const MIC_CAPTURE_OPTIONS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  voiceIsolation: true,
} as const satisfies AudioCaptureOptions;
