"use client";

import type { LocalAudioTrack } from "livekit-client";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  type DeviceSnapshot,
  deviceStore,
  SERVER_DEVICE_SNAPSHOT,
} from "./device-store";
import {
  type MediaPermissionKind,
  type MediaPermissionState,
  permissionStore,
  SERVER_PERMISSION_STATE,
} from "./permission-store";
import {
  type TrackHealth,
  trackHealthStore,
  UNKNOWN_TRACK_HEALTH,
} from "./track-health-store";

const noopSubscribe = () => () => {};
const serverPermission = () => SERVER_PERMISSION_STATE;
const serverDevices = () => SERVER_DEVICE_SNAPSHOT;
const unknownHealth = () => UNKNOWN_TRACK_HEALTH;

/** Live site permission for the microphone or camera. */
export function useMediaPermission(
  kind: MediaPermissionKind,
): MediaPermissionState {
  const store = permissionStore(kind);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    serverPermission,
  );
}

/** Every device the browser reports, refreshed on plug/unplug and on grant. */
export function useMediaDevices(): DeviceSnapshot {
  const store = deviceStore();
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    serverDevices,
  );
}

/**
 * The devices of one kind. Derived from the store snapshot with `useMemo`
 * rather than a filtering `getSnapshot`, which would hand React a new array
 * every call and re-render forever.
 */
export function useDevicesOfKind(kind: MediaDeviceKind): MediaDeviceInfo[] {
  const { devices } = useMediaDevices();
  return useMemo(
    () => devices.filter((device) => device.kind === kind),
    [devices, kind],
  );
}

/**
 * Whether a microphone track is really carrying sound. `undefined` (no track
 * yet) subscribes to nothing and reports the unknown snapshot.
 */
export function useTrackHealth(
  track: LocalAudioTrack | undefined,
): TrackHealth {
  const store = useMemo(
    () => (track ? trackHealthStore(track) : null),
    [track],
  );
  const subscribe = useCallback(
    (listener: () => void) =>
      store ? store.subscribe(listener) : noopSubscribe(),
    [store],
  );
  const getSnapshot = useCallback(
    () => (store ? store.getSnapshot() : UNKNOWN_TRACK_HEALTH),
    [store],
  );
  return useSyncExternalStore(subscribe, getSnapshot, unknownHealth);
}
