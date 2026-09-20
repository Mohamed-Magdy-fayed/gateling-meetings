"use client";

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

const PIP_WIDTH = 360;
const PIP_HEIGHT = 240;

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
  /** While true the window may be open; when it flips false it is closed. */
  active: boolean;
};

/**
 * A floating view of the other participants for whoever is sharing their
 * screen — the moment you share, the browser is behind the thing you are
 * showing, and this is the only way to keep seeing faces.
 *
 * Opening needs a user gesture, so there are three ways in:
 * - `open()` from a button (always works);
 * - an attempt right after the share starts, which succeeds when the
 *   share picker was quick enough for the click to still count;
 * - the browser's own "auto picture-in-picture" when the user switches
 *   away mid-call, which invokes the `enterpictureinpicture` media-session
 *   action (Chromium desktop) — that handler is allowed to open a window.
 */
export function usePictureInPicture({ active }: PictureInPictureOptions) {
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
        width: PIP_WIDTH,
        height: PIP_HEIGHT,
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
  }, [mode, video]);

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

  // Auto-open when the share starts; close when it stops (or we unmount).
  const wasActiveRef = useRef(false);
  useEffect(() => {
    if (mode == null) return;
    if (active && !wasActiveRef.current) {
      // Not a gesture in the browser's eyes if the picker was slow — the
      // banner's button is there for that case.
      open().catch(() => {});
    }
    if (!active && wasActiveRef.current) close();
    wasActiveRef.current = active;
  }, [active, mode, open, close]);
  useEffect(() => close, [close]);

  // Let the browser pop us out by itself when the user switches away.
  useEffect(() => {
    if (!active || mode == null) return;
    setMediaSessionAction("enterpictureinpicture", () => {
      open().catch(() => {});
    });
    return () => setMediaSessionAction("enterpictureinpicture", null);
  }, [active, mode, open]);

  return { mode, isOpen, open, close, pipWindow, videoRef };
}
