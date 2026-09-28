import { z } from "zod";

import { env } from "@/data/env/client";
import { isFlagOn, isOptInFlag } from "./flags";

/**
 * Meeting feature switches. The platform admin toggles them at runtime in
 * Settings → Features (stored in `platform_settings`, key
 * `meetingFeatures`); the room page reads them per request and hands them
 * to the room through `MeetingFeaturesProvider`. A switch the admin never
 * touched falls back to its build-time env default below.
 */
export const meetingFeaturesSchema = z.object({
  /** Laser and pen on screen shares. Per meeting, see `allowAnnotations`. */
  annotations: z.boolean(),
  /** The host's controls and admit strip in the floating window. */
  pipHostControls: z.boolean(),
  /**
   * Experimental: annotating your own share from the floating window.
   * Keep/kill: enable for everyone only if a presenter can place a pen
   * stroke within ~2% of the intended spot on a 1080p window share viewed
   * at 480×360, at under 5% extra CPU.
   */
  pipAnnotate: z.boolean(),
});
export type MeetingFeatures = z.infer<typeof meetingFeaturesSchema>;
export type MeetingFeatureKey = keyof MeetingFeatures;

/** What applies when the admin has not set a switch (build-time env). */
export const defaultMeetingFeatures: MeetingFeatures = {
  annotations: isFlagOn(env.NEXT_PUBLIC_MEETING_ANNOTATIONS),
  pipHostControls: isFlagOn(env.NEXT_PUBLIC_MEETING_PIP_HOST_CONTROLS),
  pipAnnotate: isOptInFlag(env.NEXT_PUBLIC_MEETING_PIP_ANNOTATE),
};

/**
 * Stored overrides on top of the defaults. Anything malformed in storage is
 * ignored key by key, so a bad row can never take the room down.
 */
export function resolveMeetingFeatures(
  stored: unknown,
  defaults: MeetingFeatures = defaultMeetingFeatures,
): MeetingFeatures {
  const parsed = meetingFeaturesSchema.partial().safeParse(stored);
  if (!parsed.success) return { ...defaults };
  return { ...defaults, ...stripUndefined(parsed.data) };
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/** Floating-window annotate needs both switches. */
export function isPipAnnotateAvailable(features: MeetingFeatures) {
  return features.annotations && features.pipAnnotate;
}
