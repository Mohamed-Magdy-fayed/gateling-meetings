import * as React from "react";

type ShareLinkInput = { title: string; text: string; url: string };

function hasWebShare() {
  return (
    typeof navigator !== "undefined" && typeof navigator.share === "function"
  );
}

/**
 * Web Share API support is only knowable in the browser, so the server render
 * (and first client render) says "no" and the Share button appears after mount.
 */
export function useCanShare() {
  return React.useSyncExternalStore(
    () => () => {},
    hasWebShare,
    () => false,
  );
}

/**
 * Opens the native share sheet (iOS/Android, Windows/macOS share panel).
 * Resolves `"shared"` when the user picked a target, `"dismissed"` when they
 * closed the sheet, and `"unsupported"` when the caller should copy instead.
 */
export async function shareLink(
  input: ShareLinkInput,
): Promise<"shared" | "dismissed" | "unsupported"> {
  if (!hasWebShare()) return "unsupported";
  if (typeof navigator.canShare === "function" && !navigator.canShare(input)) {
    return "unsupported";
  }
  try {
    await navigator.share(input);
    return "shared";
  } catch (error) {
    // AbortError is the user closing the sheet; anything else (e.g. a share
    // already in flight, or the OS refusing) falls back to the clipboard.
    if (error instanceof DOMException && error.name === "AbortError") {
      return "dismissed";
    }
    return "unsupported";
  }
}
