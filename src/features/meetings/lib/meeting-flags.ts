import { env } from "@/data/env/client";
import { isFlagOn, isOptInFlag } from "./flags";

const annotations = isFlagOn(env.NEXT_PUBLIC_MEETING_ANNOTATIONS);
/**
 * Experimental: annotating your own share from the floating window
 * (`pip-annotate-view.tsx`). Opt-in — on in the Vercel preview environment
 * and local `.env`, unset in production. Values are build-time, so turning
 * it on or off needs a redeploy. Keep/kill: enable in production only if a
 * presenter can place a pen stroke within ~2% of the intended spot on a
 * 1080p window share viewed at 480×360, at under 5% extra CPU.
 */
const pipAnnotate = isOptInFlag(env.NEXT_PUBLIC_MEETING_PIP_ANNOTATE);

export const meetingFlags = {
  /** Laser and pen on screen shares. Per meeting, see `allowAnnotations`. */
  annotations,
  /** The host's action strip and "Mute all" in the floating window. */
  pipHostControls: isFlagOn(env.NEXT_PUBLIC_MEETING_PIP_HOST_CONTROLS),
  pipAnnotate,
  /** Use this at render sites: floating-window annotate needs both flags. */
  pipAnnotateAvailable: annotations && pipAnnotate,
};
