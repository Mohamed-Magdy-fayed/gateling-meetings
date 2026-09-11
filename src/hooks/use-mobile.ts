import * as React from "react";

const MOBILE_BREAKPOINT = 768;

function subscribe(breakpoint: number, onStoreChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

function getSnapshot(breakpoint: number) {
  return window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches;
}

export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT) {
  return React.useSyncExternalStore(
    (onStoreChange) => subscribe(breakpoint, onStoreChange),
    () => getSnapshot(breakpoint),
    () => false,
  );
}
