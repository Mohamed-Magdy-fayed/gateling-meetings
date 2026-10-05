"use client";

/**
 * Rules for anything rendered into the floating window (Document PiP) —
 * it is a separate `window` and document:
 * - listeners, `requestAnimationFrame`, `ResizeObserver` and timers come
 *   from the element's owner window (`annotations/use-owner-window.ts`);
 *   the meeting tab is hidden, frameless and throttled while it is open;
 * - no Base UI popovers, menus, dialogs or tooltips: they portal into the
 *   meeting tab's document. Keep controls inline; use `title` for hints;
 * - no toasts: they render in the hidden tab. Use inline error slots;
 * - keyboard listeners bind to `pipWindow.document`.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { setMediaSessionAction } from "./media-session";

/** Document Picture-in-Picture (Chromium 116+) isn't in TypeScript's DOM lib yet. */
type DocumentPictureInPicture = EventTarget & {
  window: Window | null;
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
};

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

/**
 * - `document`: a floating always-on-top window we render React into
 *   (Chromium desktop). Shows everyone's camera.
 * - `video`: the classic single-`<video>` picture-in-picture (Safari,
 *   Android Chrome). Shows whoever is speaking.
 */
export type PipMode = "document" | "video";

// Chosen once, at open: bigger when the annotate view is available.
const PIP_SIZE = { width: 360, height: 240 };
const PIP_SIZE_LARGE = { width: 480, height: 360 };

function detectMode(): PipMode | null {
  if (window.documentPictureInPicture) return "document";
  if (
    document.pictureInPictureEnabled &&
    "requestPictureInPicture" in HTMLVideoElement.prototype
  ) {
    return "video";
  }
  return null;
}

/**
 * The floating window is a blank same-origin document: it gets the app's
 * stylesheets, font variables (classes on `<html>`) and text direction
 * copied over so a React portal into it looks like the rest of the room.
 */
function adoptDocumentChrome(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    if (sheet.href) {
      const link = target.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      target.head.appendChild(link);
    } else if (sheet.ownerNode instanceof HTMLStyleElement) {
      target.head.appendChild(target.importNode(sheet.ownerNode, true));
    }
  }
  target.documentElement.className = document.documentElement.className;
  target.documentElement.lang = document.documentElement.lang;
  target.documentElement.dir = document.documentElement.dir;
}

type PictureInPictureOptions = {
  /** Open at 480×360 instead of 360×240 (room for the annotate view). */
  large?: boolean;
  /**
   * The viewer is sharing: the window opens when this turns true and
   * closes when it turns false — unless it was already open before.
   */
  active: boolean;
  /**
   * The window may also be open without a share (the host watching the
   * room from other tabs or apps), so the browser may pop it out by itself
   * whenever they switch away, not only while sharing.
   */
  allowIdle?: boolean;
};

/**
 * A floating view of the other participants for whoever is sharing their
 * screen — the moment you share, the browser is behind the thing you are
 * showing, and this is the only way to keep seeing faces. The host may
 * also open it without sharing, to watch the room and the waiting queue
 * while working elsewhere.
 *
 * Opening needs a user gesture, so there are three ways in:
 * - `open()` from a button (always works);
 * - an attempt right after the share starts, which succeeds when the
 *   share picker was quick enough for the click to still count;
 * - the browser's own "auto picture-in-picture" when the user switches
 *   away mid-call, which invokes the `enterpictureinpicture` media-session
 *   action (Chromium desktop) — that handler is allowed to open a window.
 */
export function usePictureInPicture({
  active,
  large = false,
  allowIdle = false,
}: PictureInPictureOptions) {
  // Detected after mount: the server render has no `window`.
  const [mode, setMode] = useState<PipMode | null>(null);
  useEffect(() => setMode(detectMode()), []);

  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  // `video` mode: the element to float, handed over by a callback ref so
  // the effects below re-run when it mounts. Must already be playing.
  const [video, videoRef] = useState<HTMLVideoElement | null>(null);
  const [isVideoPip, setIsVideoPip] = useState(false);
  const isOpen = pipWindow != null || isVideoPip;

  const open = useCallback(async () => {
    if (mode === "document") {
      const controller = window.documentPictureInPicture;
      if (!controller || controller.window) return;
      const win = await controller.requestWindow({
        ...(large ? PIP_SIZE_LARGE : PIP_SIZE),
      });
      adoptDocumentChrome(win.document);
      win.addEventListener("pagehide", () => setPipWindow(null), {
        once: true,
      });
      setPipWindow(win);
      return;
    }
    if (mode === "video") {
      if (!video || video.readyState === HTMLMediaElement.HAVE_NOTHING) {
        throw new DOMException("No video to float", "InvalidStateError");
      }
      if (document.pictureInPictureElement === video) return;
      await video.requestPictureInPicture();
    }
  }, [mode, video, large]);

  const close = useCallback(() => {
    window.documentPictureInPicture?.window?.close();
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
  }, []);

  // Track the single-video mode's state from the element's own events.
  useEffect(() => {
    if (mode !== "video" || !video) return;
    const onEnter = () => setIsVideoPip(true);
    const onLeave = () => setIsVideoPip(false);
    video.addEventListener("enterpictureinpicture", onEnter);
    video.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      video.removeEventListener("enterpictureinpicture", onEnter);
      video.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, [mode, video]);

  // Auto-open when the share starts; close when it stops (or we unmount),
  // leaving a window that was already open before the share alone.
  const wasActiveRef = useRef(false);
  const openedForShareRef = useRef(false);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  useEffect(() => {
    if (mode == null) return;
    if (active && !wasActiveRef.current) {
      openedForShareRef.current = !isOpenRef.current;
      // Not a gesture in the browser's eyes if the picker was slow — the
      // banner's button is there for that case.
      if (!isOpenRef.current) open().catch(() => {});
    }
    if (!active && wasActiveRef.current && openedForShareRef.current) close();
    wasActiveRef.current = active;
  }, [active, mode, open, close]);
  useEffect(() => close, [close]);

  // Let the browser pop us out by itself when the user switches away.
  const canAutoOpen = active || allowIdle;
  useEffect(() => {
    if (!canAutoOpen || mode == null) return;
    setMediaSessionAction("enterpictureinpicture", () => {
      open().catch(() => {});
    });
    return () => setMediaSessionAction("enterpictureinpicture", null);
  }, [canAutoOpen, mode, open]);

  return { mode, isOpen, open, close, pipWindow, videoRef };
}
