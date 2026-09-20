/**
 * A minimal store shaped for `React.useSyncExternalStore`.
 *
 * The browser sources behind the media UI — `PermissionStatus`, the device
 * list, a track's mute flag and level — are all event-driven state that
 * lives outside React. Modelling them as stores (rather than `useState` +
 * `useEffect` per component) gives every subscriber the same snapshot in
 * the same render, no stale closures over the previous track, and no
 * duplicate browser listeners when several components watch one source.
 *
 * `getSnapshot` must return the *same reference* until something changes:
 * React compares snapshots with `Object.is` and re-renders (or, if a fresh
 * object comes back on every call, loops) on any difference. `set` therefore
 * drops updates that are equal under `isEqual`.
 *
 * `start` runs when the first listener subscribes and its return value runs
 * when the last one leaves, so browser listeners exist only while something
 * is rendered that cares — but the last snapshot is kept, so a remount
 * renders the known state at once instead of flashing through "unknown".
 */
export type ExternalStore<T> = {
  getSnapshot: () => T;
  subscribe: (listener: () => void) => () => void;
  /** Replace the snapshot (no-op when equal) and notify subscribers. */
  set: (next: T | ((current: T) => T)) => void;
};

type Options<T> = {
  initial: T;
  /** Attach browser listeners; return the detach function. */
  start?: (set: ExternalStore<T>["set"]) => (() => void) | undefined;
  isEqual?: (a: T, b: T) => boolean;
};

export function createExternalStore<T>({
  initial,
  start,
  isEqual = Object.is,
}: Options<T>): ExternalStore<T> {
  let snapshot = initial;
  let stop: (() => void) | undefined;
  const listeners = new Set<() => void>();

  const set: ExternalStore<T>["set"] = (next) => {
    const value =
      typeof next === "function" ? (next as (current: T) => T)(snapshot) : next;
    if (isEqual(snapshot, value)) return;
    snapshot = value;
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    set,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) stop = start?.(set);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stop?.();
          stop = undefined;
        }
      };
    },
  };
}

/** Shallow equality over own enumerable keys — for flat snapshot records. */
export function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  const keysA = Object.keys(a) as (keyof T)[];
  const keysB = Object.keys(b) as (keyof T)[];
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => Object.is(a[key], b[key]));
}
