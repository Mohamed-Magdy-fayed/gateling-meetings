// The call and picture-in-picture actions are in the spec and shipped in
// Chromium, but not yet in TypeScript's `MediaSessionAction` union.
export type CallAction =
  | MediaSessionAction
  | "togglemicrophone"
  | "togglecamera"
  | "hangup"
  | "enterpictureinpicture";

/** Registers (or clears) a media-session action; a no-op where unsupported. */
export function setMediaSessionAction(
  action: CallAction,
  handler: (() => void) | null,
) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.setActionHandler(
      action as MediaSessionAction,
      handler,
    );
  } catch {
    // Browser doesn't know this action — nothing to register.
  }
}
