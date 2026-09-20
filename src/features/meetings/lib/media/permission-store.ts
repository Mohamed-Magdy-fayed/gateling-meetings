import { createExternalStore, type ExternalStore } from "./external-store";

export type MediaPermissionKind = "microphone" | "camera";

export type MediaPermissionState =
  | "granted"
  | "denied"
  /** Not asked yet — the browser will prompt on the next `getUserMedia`. */
  | "prompt"
  /** This browser can't report it (Safari, older Firefox). */
  | "unsupported"
  /** Server render, or the query is still in flight. */
  | "unknown";

type PermissionsApi = {
  query: (descriptor: { name: string }) => Promise<PermissionStatus>;
};

function permissionsApi(): PermissionsApi | null {
  if (typeof navigator === "undefined") return null;
  const api = (navigator as Navigator & { permissions?: PermissionsApi })
    .permissions;
  return api && typeof api.query === "function" ? api : null;
}

function start(kind: MediaPermissionKind) {
  return (set: ExternalStore<MediaPermissionState>["set"]) => {
    const api = permissionsApi();
    if (!api) {
      set("unsupported");
      return undefined;
    }
    let status: PermissionStatus | undefined;
    let cancelled = false;
    const onChange = () => {
      if (status) set(status.state);
    };
    // `camera` / `microphone` aren't in every browser's PermissionName;
    // those reject with a TypeError, which we report as "unsupported".
    api
      .query({ name: kind })
      .then((result) => {
        if (cancelled) return;
        status = result;
        status.addEventListener("change", onChange);
        set(status.state);
      })
      .catch(() => {
        if (!cancelled) set("unsupported");
      });
    return () => {
      cancelled = true;
      status?.removeEventListener("change", onChange);
    };
  };
}

const stores = new Map<
  MediaPermissionKind,
  ExternalStore<MediaPermissionState>
>();

/**
 * Live site-permission state for one device kind. One store per kind: every
 * subscriber sees the same value and there is a single `PermissionStatus`
 * listener no matter how many components ask.
 */
export function permissionStore(
  kind: MediaPermissionKind,
): ExternalStore<MediaPermissionState> {
  let store = stores.get(kind);
  if (!store) {
    store = createExternalStore<MediaPermissionState>({
      initial: "unknown",
      start: start(kind),
    });
    stores.set(kind, store);
  }
  return store;
}

export const SERVER_PERMISSION_STATE: MediaPermissionState = "unknown";

/** Test seam: forget cached stores so a new `navigator` stub takes effect. */
export function resetPermissionStoresForTests() {
  stores.clear();
}
