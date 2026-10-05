/**
 * The host's system notification for a knock, for when nothing of the
 * room is on screen (no floating window, meeting tab hidden or behind
 * another app). Count only, never names: a whole-screen share captures
 * notifications too.
 */

const ASKED_KEY = "meetings.knockNotifyAsked";

let current: Notification | null = null;

function canNotify() {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * Asks once per browser, from a gesture in the room (Chrome ignores or
 * quiets prompts without one). A "Block" or a dismissed prompt is final.
 */
export function requestKnockNotifications(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined,
) {
  if (!canNotify() || Notification.permission !== "default") return;
  try {
    if (storage?.getItem(ASKED_KEY)) return;
    storage?.setItem(ASKED_KEY, "1");
  } catch {
    // Blocked storage: we may ask again next time; the browser caps it.
  }
  void Notification.requestPermission().catch(() => {});
}

/**
 * Shows (or replaces) the one knock notification; clicking it brings the
 * meeting tab forward. Returns false when notifications are unavailable.
 */
export function showKnockNotification({
  title,
  body,
  isSilent,
}: {
  title: string;
  body: string;
  /** Our own chime already played: no second OS sound. */
  isSilent: boolean;
}) {
  if (!canNotify() || Notification.permission !== "granted") return false;
  try {
    // `renotify` (alert again for the same tag) isn't in TypeScript's lib.
    const options: NotificationOptions & { renotify: boolean } = {
      body,
      tag: "meetings-knock",
      renotify: true,
      silent: isSilent,
    };
    current?.close();
    const notification = new Notification(title, options);
    current = notification;
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    notification.onclose = () => {
      if (current === notification) current = null;
    };
    return true;
  } catch {
    // Android Chrome only allows notifications from a service worker.
    return false;
  }
}

/** Clears the notification once nobody waits (or the host is back). */
export function closeKnockNotification() {
  current?.close();
  current = null;
}
