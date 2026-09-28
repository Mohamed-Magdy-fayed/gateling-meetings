"use client";

import { useEffect, useState } from "react";

import { useTranslation } from "@/features/core/i18n/client";
import {
  KnockTracker,
  playKnockChime,
  readKnockSound,
  unlockKnockAudio,
  writeKnockSound,
} from "./knock-chime";
import { pipDiag } from "./pip-diag";
import { applyBadge } from "./title-badge";

function localStore(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** The host is looking elsewhere: the meeting tab is hidden or they present. */
function isLookingAway() {
  return (
    document.visibilityState === "hidden" ||
    window.documentPictureInPicture?.window != null
  );
}

export type KnockSound = { isOn: boolean; set: (isOn: boolean) => void };

/**
 * Host-only knock cues that work in every browser:
 * - while the meeting tab is hidden and people wait, its title starts with
 *   "(n)" — count only (a whole-screen share can capture the tab strip),
 *   re-applied on top of other title writers, never doubled;
 * - a short chime for each new knock while the tab is hidden or the
 *   floating window is open, at most one per 10 s (see knock-chime.ts),
 *   unless the viewer turned "Knock sound" off.
 */
export function useKnockCues({
  isHost,
  waitingIds,
}: {
  isHost: boolean;
  waitingIds: readonly string[];
}): KnockSound {
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
  // click or key press in the room (joining, sharing) unlocks it.
  useEffect(() => {
    if (!isHost) return;
    document.addEventListener("pointerdown", unlockKnockAudio, true);
    document.addEventListener("keydown", unlockKnockAudio, true);
    return () => {
      document.removeEventListener("pointerdown", unlockKnockAudio, true);
      document.removeEventListener("keydown", unlockKnockAudio, true);
    };
  }, [isHost]);

  const [isOn, setIsOn] = useState(true);
  useEffect(() => setIsOn(readKnockSound(localStore())), []);

  const [tracker] = useState(() => new KnockTracker());
  const idsKey = waitingIds.join(",");
  useEffect(() => {
    if (!isHost) return;
    const ids = idsKey ? idsKey.split(",") : [];
    const shouldChime = tracker.update(ids, isLookingAway(), performance.now());
    if (shouldChime && isOn && !playKnockChime()) {
      pipDiag("chime-skipped", "audio not unlocked by a gesture yet");
    }
  }, [idsKey, isHost, isOn, tracker]);

  return {
    isOn,
    set: (next) => {
      setIsOn(next);
      writeKnockSound(localStore(), next);
    },
  };
}
