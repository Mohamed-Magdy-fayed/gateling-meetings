"use client";

import { useLocalParticipant } from "@livekit/components-react";
import {
  PauseIcon,
  PictureInPicture2Icon,
  ScreenShareIcon,
} from "lucide-react";

import { useTranslation } from "@/features/core/i18n/client";
import { cn } from "@/lib/utils";
import {
  AnnotateToggle,
  AnnotatingNotice,
  SharerAnnotateNotice,
} from "./annotations/sharer-controls";
import type { PopOut } from "./pop-out-window";
import {
  BannerButton,
  PauseButton,
  StopButton,
  useSharePause,
} from "./share-controls";

type SharingBannerProps = {
  /** The room's floating window (see `usePopOut`). */
  popOut: PopOut;
  /** The sharer's Annotate view (their own share on their stage, with ink). */
  isAnnotating: boolean;
  onAnnotatingChange: (next: boolean) => void;
};

/**
 * Shown to whoever is sharing their screen. Their own share is kept off
 * their stage (see `Stage`), so this strip is the reminder that they are
 * sharing, the way to pause or stop, and the way to pop the participants
 * (themselves included) out into a floating window that stays on top of
 * whatever they are showing (rendered by `PopOutWindow`).
 */
export function SharingBanner({
  popOut,
  isAnnotating,
  onAnnotatingChange,
}: SharingBannerProps) {
  const { t } = useTranslation();
  const { isScreenShareEnabled } = useLocalParticipant();
  const pause = useSharePause();

  if (!isScreenShareEnabled) return null;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 px-3 py-1.5 text-xs",
        pause.isPaused
          ? "bg-warning/15 text-warning"
          : "bg-primary/15 text-primary",
      )}
    >
      {pause.isPaused ? (
        <PauseIcon className="size-4" aria-hidden />
      ) : (
        <ScreenShareIcon className="size-4" aria-hidden />
      )}
      <span role="status">
        {pause.isPaused
          ? t("meetings.room.sharingPaused")
          : t("meetings.room.youAreSharing")}
      </span>
      <PauseButton pause={pause} />
      {popOut.mode && (
        <BannerButton
          onClick={popOut.toggle}
          title={
            popOut.isOpen
              ? undefined
              : popOut.isMonitorShare
                ? t("meetings.room.popOutMonitorHint")
                : t("meetings.room.popOutHint")
          }
        >
          <PictureInPicture2Icon className="size-3.5" aria-hidden />
          {popOut.isOpen ? t("meetings.room.popIn") : t("meetings.room.popOut")}
        </BannerButton>
      )}
      <AnnotateToggle isOn={isAnnotating} onChange={onAnnotatingChange} />
      <StopButton />
      <AnnotatingNotice
        isAnnotating={isAnnotating}
        onShow={() => onAnnotatingChange(true)}
      />
      {isAnnotating && <SharerAnnotateNotice />}
    </div>
  );
}
