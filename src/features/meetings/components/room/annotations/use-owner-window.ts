"use client";

/**
 * The window an element lives in. Annotation layers render either in the
 * meeting tab or inside the floating (Document Picture-in-Picture) window,
 * which is a separate `window`: listeners, `requestAnimationFrame`,
 * `ResizeObserver`, timers and `document.visibilityState` must come from
 * that window — the meeting tab is hidden (no frames, throttled timers)
 * exactly while the floating window is in use.
 */
export type OwnerWindow = Window & typeof globalThis;

export function ownerWindow(element: Element | null | undefined): OwnerWindow {
  return element?.ownerDocument.defaultView ?? window;
}

/** `ownerWindow` for a (possibly not yet mounted) element. */
export function useOwnerWindow(
  element: Element | null | undefined,
): OwnerWindow {
  return ownerWindow(element);
}
