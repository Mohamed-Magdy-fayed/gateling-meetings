"use client";

import { useEffect } from "react";

import { useTranslation } from "@/features/core/i18n/client";
import { applyBadge } from "./title-badge";

/**
 * Host-only knock cue that works in every browser: while the meeting tab is
 * hidden and people are waiting, its title starts with "(n)". The count is
 * all it shows (a whole-screen share can capture the tab strip). Other
 * title writers are respected: the badge is re-applied on top of whatever
 * they set, never doubled (see title-badge.ts).
 */
export function useKnockCues({
  isHost,
  waitingCount,
}: {
  isHost: boolean;
  waitingCount: number;
}) {
  const { t } = useTranslation();
  const badge =
    isHost && waitingCount > 0
      ? t("meetings.waiting.tabBadge", { count: waitingCount })
      : null;

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
}
