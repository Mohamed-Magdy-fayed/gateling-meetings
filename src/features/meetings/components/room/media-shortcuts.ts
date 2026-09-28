type Toggle = { toggle: () => unknown };

/** Typing in a field, or a modifier held (browser/OS shortcuts), never toggles. */
function isIgnored(event: KeyboardEvent) {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
    return true;
  }
  const target = event.target;
  return (
    typeof target === "object" &&
    target != null &&
    "closest" in target &&
    typeof target.closest === "function" &&
    target.closest("input, textarea, select, [contenteditable=true]") != null
  );
}

/**
 * M toggles the microphone, V the camera. Shared by the control bar and the
 * floating window. Returns whether the key was handled, so callers can layer
 * their own keys (the control bar adds H) on the same rules.
 */
export function handleMediaShortcut(
  event: KeyboardEvent,
  { mic, camera }: { mic: Toggle; camera: Toggle },
): boolean {
  if (isIgnored(event)) return false;
  const key = event.key.toLowerCase();
  if (key === "m") {
    mic.toggle();
    return true;
  }
  if (key === "v") {
    camera.toggle();
    return true;
  }
  return false;
}

/** The same rules for other keys (the control bar's H for raise hand). */
export function isShortcutKey(event: KeyboardEvent, key: string): boolean {
  return !isIgnored(event) && event.key.toLowerCase() === key;
}
