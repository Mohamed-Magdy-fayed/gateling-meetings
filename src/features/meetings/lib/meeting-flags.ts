import { env } from "@/data/env/client";
import { isFlagOn } from "./flags";

export const meetingFlags = {
  /** Laser and pen on screen shares. Per meeting, see `allowAnnotations`. */
  annotations: isFlagOn(env.NEXT_PUBLIC_MEETING_ANNOTATIONS),
  /** The host's action strip and "Mute all" in the floating window. */
  pipHostControls: isFlagOn(env.NEXT_PUBLIC_MEETING_PIP_HOST_CONTROLS),
};
