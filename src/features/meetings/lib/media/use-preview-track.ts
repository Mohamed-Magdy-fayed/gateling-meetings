"use client";

import {
  createLocalAudioTrack,
  createLocalVideoTrack,
  type LocalAudioTrack,
  type LocalVideoTrack,
  VideoPresets,
} from "livekit-client";
import { useEffect, useRef, useState } from "react";

import { useDevicesOfKind, useMediaPermission } from "./hooks";
import { classifyMediaError, type MediaFailure } from "./media-failure";

type Kind = "audioinput" | "videoinput";
type TrackFor<K extends Kind> = K extends "audioinput"
  ? LocalAudioTrack
  : LocalVideoTrack;

export type PreviewTrack<K extends Kind> = {
  track: TrackFor<K> | undefined;
  /** Why there is no track although one was asked for. */
  failure: MediaFailure | null;
  /** Still opening the device. */
  isPending: boolean;
  /** The device the browser actually opened — may differ from what we asked. */
  actualDeviceId: string | null;
  retry: () => void;
};

async function create<K extends Kind>(
  kind: K,
  deviceId: string,
): Promise<TrackFor<K>> {
  const id = deviceId || undefined;
  if (kind === "audioinput") {
    return (await createLocalAudioTrack({
      deviceId: id,
      echoCancellation: true,
      noiseSuppression: true,
    })) as TrackFor<K>;
  }
  return (await createLocalVideoTrack({
    deviceId: id,
    resolution: VideoPresets.h720.resolution,
  })) as TrackFor<K>;
}

/**
 * A lobby preview track we own outright.
 *
 * Replaces LiveKit's `usePreviewDevice`, which (a) closes over the track from
 * its first render in its unmount cleanup and so never stops the one it made
 * later — the camera light stays on after leaving — and (b) gives up for
 * good after one error, so someone who unblocks the site in the address bar
 * still sees "blocked" until they reload.
 *
 * Every effect run stops exactly the track *it* created. A failure retries
 * on its own when the permission flips to granted or a device appears, and
 * on demand via `retry()`.
 */
export function usePreviewTrack<K extends Kind>(
  kind: K,
  enabled: boolean,
  deviceId: string,
): PreviewTrack<K> {
  const [track, setTrack] = useState<TrackFor<K>>();
  const [failure, setFailure] = useState<MediaFailure | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [actualDeviceId, setActualDeviceId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const permission = useMediaPermission(
    kind === "audioinput" ? "microphone" : "camera",
  );
  const deviceCount = useDevicesOfKind(kind).length;

  // The id to open is read at creation time; later changes switch the live
  // track instead of tearing it down (see below), so it's a ref here.
  const deviceIdRef = useRef(deviceId);
  deviceIdRef.current = deviceId;

  // `attempt` is the retry trigger: bumping it re-runs this effect on purpose.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is a deliberate re-run key
  useEffect(() => {
    if (!enabled) {
      setTrack(undefined);
      setFailure(null);
      setIsPending(false);
      return;
    }
    let cancelled = false;
    let created: TrackFor<K> | undefined;
    setIsPending(true);
    setFailure(null);
    create(kind, deviceIdRef.current)
      .then(async (next) => {
        if (cancelled) {
          next.stop();
          return;
        }
        created = next;
        setTrack(next);
        setActualDeviceId((await next.getDeviceId(false)) ?? null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setTrack(undefined);
        setFailure(classifyMediaError(error));
      })
      .finally(() => {
        if (!cancelled) setIsPending(false);
      });
    return () => {
      cancelled = true;
      created?.stop();
      setTrack(undefined);
    };
  }, [kind, enabled, attempt]);

  // Switching devices while previewing: restart in place, no flicker.
  useEffect(() => {
    if (!track || !deviceId) return;
    let cancelled = false;
    track
      .getDeviceId(false)
      .then(async (current) => {
        if (cancelled || current === deviceId) return;
        await track.setDeviceId(deviceId);
        if (cancelled) return;
        setActualDeviceId((await track.getDeviceId(false)) ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailure(classifyMediaError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [track, deviceId]);

  // Self-heal: the person unblocked the site, or plugged a device in.
  const wasBlocked = failure === "denied" && permission === "granted";
  const deviceAppeared = failure === "notFound" && deviceCount > 0;
  useEffect(() => {
    if (enabled && (wasBlocked || deviceAppeared)) {
      setAttempt((count) => count + 1);
    }
  }, [enabled, wasBlocked, deviceAppeared]);

  return {
    track,
    failure,
    isPending,
    actualDeviceId,
    retry: () => setAttempt((count) => count + 1),
  };
}
