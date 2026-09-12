"use client";

import { useRoomContext } from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import { useEffect } from "react";

type KeepAliveOptions = {
  title: string;
  appName: string;
  onLeave: () => void;
};

// The call actions are in the spec and shipped in Chromium, but not yet in
// TypeScript's `MediaSessionAction` union.
type CallAction =
  | MediaSessionAction
  | "togglemicrophone"
  | "togglecamera"
  | "hangup";

function setAction(action: CallAction, handler: (() => void) | null) {
  try {
    navigator.mediaSession.setActionHandler(
      action as MediaSessionAction,
      handler,
    );
  } catch {
    // Browser doesn't know this action — nothing to register.
  }
}

/**
 * Keeps a phone call-shaped while the room is open.
 *
 * Mobile browsers treat a tab as disposable unless it looks like media:
 * - A screen wake lock stops the phone auto-locking mid-meeting (the
 *   display is still the only thing iOS Safari will keep WebRTC alive
 *   behind — it suspends everything once the screen is off).
 * - A media session makes the meeting show up as "now playing" with
 *   mute / hang-up controls on the lock screen and notification shade,
 *   and is what lets Android Chrome keep audio flowing when the tab is
 *   in the background.
 *
 * Everything here is best effort and no-ops where the API is missing.
 */
export function useKeepAlive({ title, appName, onLeave }: KeepAliveOptions) {
  const room = useRoomContext();

  // Screen wake lock. The browser releases it whenever the page is
  // hidden, so re-acquire every time we come back.
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;

    async function acquire() {
      if (disposed || document.visibilityState !== "visible") return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Denied (low battery, energy saver, insecure context) — fine.
      }
    }

    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", acquire);
      sentinel?.release().catch(() => {});
    };
  }, []);

  // Media session: metadata + lock-screen controls.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;

    session.metadata = new MediaMetadata({ title, artist: appName });
    session.playbackState = "playing";

    setAction("togglemicrophone", () => {
      void room.localParticipant.setMicrophoneEnabled(
        !room.localParticipant.isMicrophoneEnabled,
      );
    });
    setAction("togglecamera", () => {
      void room.localParticipant.setCameraEnabled(
        !room.localParticipant.isCameraEnabled,
      );
    });
    setAction("hangup", onLeave);
    // Without handlers the browser's default "pause" would stop the
    // remote audio elements — in a call there is nothing to pause.
    setAction("play", () => {});
    setAction("pause", () => {});

    return () => {
      session.metadata = null;
      session.playbackState = "none";
      for (const action of [
        "togglemicrophone",
        "togglecamera",
        "hangup",
        "play",
        "pause",
      ] as const) {
        setAction(action, null);
      }
    };
  }, [room, title, appName, onLeave]);

  // Mirror the mic / camera state into the OS controls.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;

    function sync() {
      const { localParticipant } = room;
      session
        .setMicrophoneActive?.(localParticipant.isMicrophoneEnabled)
        ?.catch(() => {});
      session
        .setCameraActive?.(localParticipant.isCameraEnabled)
        ?.catch(() => {});
    }
    function onTrack(publication: { source: Track.Source }) {
      if (
        publication.source === Track.Source.Microphone ||
        publication.source === Track.Source.Camera
      ) {
        sync();
      }
    }

    sync();
    room.on(RoomEvent.LocalTrackPublished, onTrack);
    room.on(RoomEvent.LocalTrackUnpublished, onTrack);
    room.on(RoomEvent.TrackMuted, onTrack);
    room.on(RoomEvent.TrackUnmuted, onTrack);
    return () => {
      room.off(RoomEvent.LocalTrackPublished, onTrack);
      room.off(RoomEvent.LocalTrackUnpublished, onTrack);
      room.off(RoomEvent.TrackMuted, onTrack);
      room.off(RoomEvent.TrackUnmuted, onTrack);
    };
  }, [room]);
}
