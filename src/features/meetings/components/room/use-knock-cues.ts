"use client";

import { useEffect, useEffectEvent, useState } from "react";

import { useTranslation } from "@/features/core/i18n/client";
import {
  KnockTracker,
  playKnockChime,
  readKnockSound,
  unlockKnockAudio,
  writeKnockSound,
} from "./knock-chime";
import {
  closeKnockNotification,
  requestKnockNotifications,
  showKnockNotification,
} from "./knock-notify";
import { pipDiag } from "./pip-diag";
import { applyBadge } from "./title-badge";

/** While anyone waits, owed chimes and reminders are checked this often. */
const TICK_MS = 1_000;

function localStore(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The host is looking elsewhere: the meeting tab is hidden or unfocused
 * (another app on top), or they watch the room from the floating window.
 */
function isLookingAway() {
  return (
    document.visibilityState === "hidden" ||
    !document.hasFocus() ||
    window.documentPictureInPicture?.window != null
  );
}

export type KnockSound = { isOn: boolean; set: (isOn: boolean) => void };

export type KnockCues = {
  sound: KnockSound;
  /** Goes up on every new knock and reminder: the waiting strip flashes. */
  flashKey: number;
};

/**
 * Host-only knock cues that work in every browser:
 * - while the meeting tab is hidden and people wait, its title starts with
 *   "(n)" — count only (a whole-screen share can capture the tab strip),
 *   re-applied on top of other title writers, never doubled;
 * - a short chime for new knocks while the host is away, and a reminder
 *   every 30 s while those people still wait (see knock-chime.ts), unless
 *   the viewer turned "Knock sound" off;
 * - a flash on the waiting strip for every new knock and reminder;
 * - a system notification for new knocks when no floating window is open,
 *   so a host in another app still sees that someone is waiting.
 */
export function useKnockCues({
  isHost,
  waitingIds,
  isPopOutOpen,
}: {
  isHost: boolean;
  waitingIds: readonly string[];
  /** The floating window (with its waiting strip) is on screen. */
  isPopOutOpen: boolean;
}): KnockCues {
  const { t } = useTranslation();
  const count = waitingIds.length;
  const badge =
    isHost && count > 0 ? t("meetings.waiting.tabBadge", { count }) : null;

  useEffect(() => {
    const sync = () => {
      const next = applyBadge(
        document.title,
        document.visibilityState === "hidden" ? badge : null,
      );
      if (next !== document.title) document.title = next;
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    // Next.js metadata may replace the title (or its <title> node).
    const observer = new MutationObserver(sync);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => {
      document.removeEventListener("visibilitychange", sync);
      observer.disconnect();
      document.title = applyBadge(document.title, null);
    };
  }, [badge]);

  // Autoplay policy: audio may only start from a gesture, so the first
  // click or key press in the room (joining, sharing) unlocks it — and
  // asks, once, to show knock notifications.
  useEffect(() => {
    if (!isHost) return;
    const unlock = () => {
      unlockKnockAudio();
      requestKnockNotifications(localStore());
    };
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);
    return () => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
    };
  }, [isHost]);

  const [isOn, setIsOn] = useState(true);
  useEffect(() => setIsOn(readKnockSound(localStore())), []);

  const [tracker] = useState(() => new KnockTracker());
  const [flashKey, setFlashKey] = useState(0);
  const idsKey = waitingIds.join(",");

  const check = useEffectEvent(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    const { cue, hasNew } = tracker.update(
      ids,
      isLookingAway(),
      performance.now(),
    );
    if (hasNew || cue) setFlashKey((key) => key + 1);
    if (!cue) return;
    const hasChimed = isOn && playKnockChime();
    if (isOn && !hasChimed) {
      pipDiag("chime-skipped", "audio not unlocked by a gesture yet");
    }
    if (cue === "knock" && !isPopOutOpen) {
      showKnockNotification({
        title: t("meetings.waiting.queueTitle", { count: ids.length }),
        body: t("meetings.waiting.notifyBody"),
        isSilent: hasChimed,
      });
    }
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-check whenever the waiting list changes
  useEffect(() => {
    if (!isHost) return;
    check();
  }, [idsKey, isHost]);

  // Owed chimes and reminders come due between polls.
  useEffect(() => {
    if (!isHost || count === 0) return;
    const id = setInterval(check, TICK_MS);
    return () => clearInterval(id);
  }, [isHost, count]);

  // Nobody left to let in: the notification has nothing to say.
  useEffect(() => {
    if (count === 0) closeKnockNotification();
  }, [count]);
  useEffect(() => closeKnockNotification, []);

  return {
    flashKey,
    sound: {
      isOn,
      set: (next) => {
        setIsOn(next);
        writeKnockSound(localStore(), next);
      },
    },
  };
}
