import { createExternalStore, type ExternalStore } from "./external-store";
import { permissionStore } from "./permission-store";

export type DeviceSnapshot = {
  devices: readonly MediaDeviceInfo[];
  /** False until the first `enumerateDevices` resolved. */
  isLoaded: boolean;
};

const EMPTY: DeviceSnapshot = { devices: [], isLoaded: false };

function sameDevices(
  a: readonly MediaDeviceInfo[],
  b: readonly MediaDeviceInfo[],
) {
  return (
    a.length === b.length &&
    a.every(
      (device, index) =>
        device.deviceId === b[index]?.deviceId &&
        device.kind === b[index]?.kind &&
        device.label === b[index]?.label &&
        device.groupId === b[index]?.groupId,
    )
  );
}

function start(set: ExternalStore<DeviceSnapshot>["set"]) {
  const mediaDevices =
    typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.enumerateDevices !== "function") {
    set({ devices: [], isLoaded: true });
    return undefined;
  }
  let cancelled = false;
  const refresh = () => {
    mediaDevices
      .enumerateDevices()
      .then((devices) => {
        if (cancelled) return;
        // Chrome lists a device with an empty id before permission is
        // granted; it is a placeholder, not something one can select.
        const usable = devices.filter((device) => device.deviceId !== "");
        set((current) =>
          current.isLoaded && sameDevices(current.devices, usable)
            ? current
            : { devices: usable, isLoaded: true },
        );
      })
      .catch(() => {
        if (!cancelled) set((current) => ({ ...current, isLoaded: true }));
      });
  };
  refresh();
  mediaDevices.addEventListener?.("devicechange", refresh);
  // Labels (and, in Firefox, the devices themselves) appear once permission
  // is granted; not every browser fires `devicechange` for that.
  const unsubscribes = (["microphone", "camera"] as const).map((kind) =>
    permissionStore(kind).subscribe(refresh),
  );
  return () => {
    cancelled = true;
    mediaDevices.removeEventListener?.("devicechange", refresh);
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}

let store: ExternalStore<DeviceSnapshot> | undefined;

/** Every camera, microphone and speaker the browser will show us. */
export function deviceStore(): ExternalStore<DeviceSnapshot> {
  store ??= createExternalStore<DeviceSnapshot>({ initial: EMPTY, start });
  return store;
}

export const SERVER_DEVICE_SNAPSHOT = EMPTY;

/** Test seam. */
export function resetDeviceStoreForTests() {
  store = undefined;
}

/**
 * The device to actually open for a remembered id. An id saved last week
 * may belong to a headset that isn't plugged in today; handing it to the
 * browser anyway means it silently opens *something else*, and the person
 * ends up talking into a device nobody chose. Empty means "browser default".
 */
export function resolveDeviceId(
  savedId: string,
  devices: readonly MediaDeviceInfo[],
  kind: MediaDeviceKind,
): string {
  if (!savedId) return "";
  const ofKind = devices.filter((device) => device.kind === kind);
  if (ofKind.length === 0) return savedId;
  return ofKind.some((device) => device.deviceId === savedId)
    ? savedId
    : ((ofKind.find((device) => device.deviceId === "default") ?? ofKind[0])
        ?.deviceId ?? "");
}

/** A human label for a device id, falling back to "Microphone 2"-style. */
export function deviceLabel(
  deviceId: string,
  devices: readonly MediaDeviceInfo[],
  kind: MediaDeviceKind,
  fallback: string,
): string {
  const ofKind = devices.filter((device) => device.kind === kind);
  const index = ofKind.findIndex((device) => device.deviceId === deviceId);
  if (index === -1) return fallback;
  return ofKind[index]?.label || `${fallback} ${index + 1}`;
}
