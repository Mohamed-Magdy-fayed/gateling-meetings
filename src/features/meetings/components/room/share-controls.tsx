"use client";

import {
  useLocalParticipant,
  useTrackMutedIndicator,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { PauseIcon, PlayIcon, ScreenShareOffIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useTranslation } from "@/features/core/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Pausing mutes the share rather than unpublishing it: the capture session
 * stays alive (LiveKit only stops the underlying track for cameras), so
 * resuming never brings the browser's picker back, and viewers keep the
 * share pinned with a "paused" placeholder instead of a frozen frame.
 */
export function useSharePause() {
  const { t } = useTranslation();
  const { localParticipant } = useLocalParticipant();
  const { isMuted: isPaused } = useTrackMutedIndicator({
    participant: localParticipant,
    source: Track.Source.ScreenShare,
  });
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      await Promise.all(
        [Track.Source.ScreenShare, Track.Source.ScreenShareAudio].map(
          (source) => {
            const publication = localParticipant.getTrackPublication(source);
            return isPaused ? publication?.unmute() : publication?.mute();
          },
        ),
      );
    } catch {
      toast.error(t("meetings.room.pauseSharingFailed"));
    } finally {
      setPending(false);
    }
  }

  return { isPaused, pending, toggle };
}

/** The compact text button used in the sharing banner and the floating window. */
export function BannerButton({
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors hover:bg-current/15 focus-visible:outline-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    />
  );
}

/** In a narrow floating window (under 480px) the label is for screen readers only. */
function Label({ compact, children }: { compact?: boolean; children: string }) {
  return compact ? (
    <span className="max-[479px]:sr-only">{children}</span>
  ) : (
    children
  );
}

export function PauseButton({
  pause,
  compact,
}: {
  pause: ReturnType<typeof useSharePause>;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const label = pause.isPaused
    ? t("meetings.room.resumeSharing")
    : t("meetings.room.pauseSharing");
  return (
    <BannerButton
      onClick={() => void pause.toggle()}
      disabled={pause.pending}
      title={compact ? label : undefined}
      className={cn(compact && "min-h-8")}
    >
      {pause.isPaused ? (
        <PlayIcon className="size-3.5" aria-hidden />
      ) : (
        <PauseIcon className="size-3.5" aria-hidden />
      )}
      <Label compact={compact}>{label}</Label>
    </BannerButton>
  );
}

export function StopButton({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { localParticipant } = useLocalParticipant();
  const label = t("meetings.room.stopSharing");
  return (
    <BannerButton
      onClick={() => void localParticipant.setScreenShareEnabled(false)}
      title={compact ? label : undefined}
      className={cn(
        "text-destructive hover:bg-destructive/15",
        compact && "min-h-8",
      )}
    >
      <ScreenShareOffIcon className="size-3.5" aria-hidden />
      <Label compact={compact}>{label}</Label>
    </BannerButton>
  );
}
