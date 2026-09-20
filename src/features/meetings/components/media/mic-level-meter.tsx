"use client";

import type { LocalAudioTrack } from "livekit-client";

import { useTranslation } from "@/features/core/i18n/client";
import { useTrackHealth } from "@/features/meetings/lib/media";
import { cn } from "@/lib/utils";

const BARS = 12;

/**
 * The bars that move when you talk. This is the one control that lets a
 * person prove to themselves that sound is getting in *before* they join
 * and find out from everyone else that it isn't.
 */
export function MicLevelMeter({
  track,
  className,
}: {
  track: LocalAudioTrack | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const { level, status } = useTrackHealth(track);
  const lit = Math.round(level * BARS);
  const isDead = status === "silent" || status === "hardwareMuted";

  return (
    <div className={cn("flex h-4 items-center gap-0.5", className)}>
      {/* The real meter for assistive tech; the bars are the visual. */}
      <meter
        className="sr-only"
        aria-label={t("meetings.media.level")}
        min={0}
        max={100}
        value={Math.round(level * 100)}
      />
      {Array.from({ length: BARS }, (_, index) => (
        <span
          // Static bars: position is the identity.
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length meter
          key={index}
          className={cn(
            "w-1 rounded-full transition-[background-color,height] duration-100",
            index < lit
              ? "bg-success"
              : isDead
                ? "bg-destructive/40"
                : "bg-current/20",
            index < lit ? "h-4" : "h-2",
          )}
        />
      ))}
    </div>
  );
}
