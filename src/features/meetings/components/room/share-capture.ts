"use client";

import type { ScreenShareCaptureOptions } from "livekit-client";
import { useSyncExternalStore } from "react";

/**
 * Chrome's `CaptureController` (Chromium 109+; Captured Surface Control —
 * scroll and zoom of a shared tab — 136+). Not in TypeScript's DOM lib
 * yet, so only what we use, all optional: feature-detect every call.
 */
export type ShareCaptureController = EventTarget & {
  forwardWheel?: (element: HTMLElement | null) => Promise<void>;
  getSupportedZoomLevels?: () => number[];
  zoomLevel?: number | null;
  setZoomLevel?: (level: number) => Promise<void>;
};

/** A controller that can scroll and zoom the captured tab. */
export type ControllableCapture = ShareCaptureController &
  Required<
    Pick<
      ShareCaptureController,
      "forwardWheel" | "getSupportedZoomLevels" | "setZoomLevel"
    >
  >;

declare global {
  interface Window {
    CaptureController?: new () => ShareCaptureController;
  }
}

/**
 * The capture session behind the local screen share. A controller can be
 * handed to `getDisplayMedia` only once, so every share gets a fresh one.
 */
let current: ShareCaptureController | null = null;
const listeners = new Set<() => void>();

function setCurrent(next: ShareCaptureController | null) {
  current = next;
  for (const listener of listeners) listener();
}

/**
 * Meet-style share picker: the "Chrome tab" pane first (a tab share keeps
 * the floating window and controls out of the share, can carry the tab's
 * audio, and is the only kind the meeting can scroll and zoom), the
 * meeting's own tab left out (an infinite tunnel), "Share this tab
 * instead" on, and system audio offered for window/screen shares.
 */
export function newShareCaptureOptions(): ScreenShareCaptureOptions {
  const Controller =
    typeof window === "undefined" ? undefined : window.CaptureController;
  const controller = Controller ? new Controller() : null;
  setCurrent(controller);
  return {
    audio: true,
    video: { displaySurface: "browser" },
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
    systemAudio: "include",
    ...(controller ? { controller } : {}),
  };
}

export function clearShareCapture() {
  setCurrent(null);
}

/** The current share's capture controller, if the browser has one. */
export function useShareCaptureController() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}

/** Captured Surface Control: only tab shares, only Chromium 136+. */
export function canControlSurface(
  controller: ShareCaptureController | null,
  video: HTMLVideoElement | null,
): controller is ControllableCapture {
  if (
    !controller?.forwardWheel ||
    !controller.getSupportedZoomLevels ||
    !controller.setZoomLevel
  ) {
    return false;
  }
  const stream = video?.srcObject;
  // Not `instanceof`: the floating window has its own globals.
  if (!stream || !("getVideoTracks" in stream)) return false;
  const surface = stream.getVideoTracks()[0]?.getSettings().displaySurface;
  return surface === "browser";
}
