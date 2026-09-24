"use client";

import {
  isTrackReference,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-core";
import {
  useConnectionQualityIndicator,
  useFocusToggle,
  useIsSpeaking,
  useTrackMutedIndicator,
  useTrackRefContext,
  VideoTrack,
} from "@livekit/components-react";
import { ConnectionQuality, Track } from "livekit-client";
import {
  HandIcon,
  MicOffIcon,
  PauseIcon,
  PinIcon,
  PinOffIcon,
  ScreenShareIcon,
} from "lucide-react";

import { useTranslation } from "@/features/core/i18n/client";
import { cn } from "@/lib/utils";
import { useHostIdentity } from "./host-identity";
import { useHandRaised } from "./use-hand-raise";

/**
 * One video cell. Rendered inside `GridLayout` / `CarouselLayout` /
 * `FocusLayout`, which hand the track reference down through context — so
 * the component takes no props and reads `useTrackRefContext()`.
 */
export function ParticipantTile({ className, pinnable = true }: TileOptions) {
  const trackRef = useTrackRefContext();
  return (
    <ParticipantTileInner
      trackRef={trackRef}
      className={className}
      pinnable={pinnable}
    />
  );
}

type TileOptions = {
  className?: string;
  /** Off where there is no stage to pin to (the floating window). */
  pinnable?: boolean;
};

function ParticipantTileInner({
  trackRef,
  className,
  pinnable,
}: TileOptions & { trackRef: TrackReferenceOrPlaceholder }) {
  const { t } = useTranslation();
  const participant = trackRef.participant;
  const isLocal = participant.isLocal;
  const isScreenShare = trackRef.source === Track.Source.ScreenShare;
  const isSpeaking = useIsSpeaking(participant);
  const isHandRaised = useHandRaised(participant);
  const { quality } = useConnectionQualityIndicator({ participant });
  const isHost = participant.identity === useHostIdentity();

  const { isMuted: isMicMuted } = useTrackMutedIndicator({
    participant,
    source: Track.Source.Microphone,
  });
  const { isMuted: isCameraMuted } = useTrackMutedIndicator(
    isScreenShare ? trackRef : { participant, source: Track.Source.Camera },
  );

  const { mergedProps: pinProps, inFocus } = useFocusToggle({
    trackRef,
    props: {},
  });

  const hasVideo = isTrackReference(trackRef) && !isCameraMuted;
  const name = participant.name || participant.identity;
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      className={cn(
        "group/tile relative isolate flex size-full min-h-0 overflow-hidden rounded-xl bg-neutral-800/80 ring-2 ring-transparent transition-[box-shadow] duration-200",
        isSpeaking && !isScreenShare && "ring-primary",
        className,
      )}
      data-mirror={isLocal && !isScreenShare ? "true" : undefined}
    >
      {hasVideo ? (
        <VideoTrack
          trackRef={trackRef}
          className={cn(
            "size-full",
            isScreenShare ? "object-contain" : "object-cover",
          )}
        />
      ) : isScreenShare ? (
        // A muted share is a paused one (see SharingBanner) — say so
        // rather than showing a face placeholder in the presenter's slot.
        <div className="grid size-full place-content-center justify-items-center gap-3 p-4 text-center text-sm text-neutral-300">
          <PauseIcon className="size-8 text-warning" aria-hidden />
          <p className="text-pretty">
            {isLocal
              ? t("meetings.room.sharingPaused")
              : t("meetings.room.sharePausedBy", { name })}
          </p>
        </div>
      ) : (
        <div className="grid size-full place-items-center">
          <div
            className={cn(
              "grid size-16 place-items-center rounded-full bg-primary/20 font-display text-2xl text-primary transition-transform sm:size-20 sm:text-3xl",
              isSpeaking && "scale-110",
            )}
          >
            {initial}
          </div>
        </div>
      )}

      {/* Name plate */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent p-2 pt-8">
        <span className="flex min-w-0 items-center gap-1.5 rounded-md bg-black/40 px-2 py-1 text-xs font-medium text-white backdrop-blur">
          {isScreenShare && <ScreenShareIcon className="size-3.5 shrink-0" />}
          {isMicMuted && !isScreenShare && (
            <MicOffIcon className="size-3.5 shrink-0 text-destructive" />
          )}
          <span className="truncate">
            {isLocal ? t("meetings.room.you") : name}
          </span>
          {(quality === ConnectionQuality.Poor ||
            quality === ConnectionQuality.Lost) && (
            <span
              role="img"
              aria-label={t("meetings.room.poorConnection")}
              title={t("meetings.room.poorConnection")}
              className="size-2 shrink-0 rounded-full bg-warning"
            />
          )}
          {isHost && !isScreenShare && (
            <span className="rounded-sm bg-primary/90 px-1 text-[0.625rem] font-semibold uppercase tracking-wide text-primary-foreground">
              {t("meetings.room.host")}
            </span>
          )}
        </span>
      </div>

      {isHandRaised && !isScreenShare && (
        <span
          role="img"
          className="absolute top-2 start-2 grid size-8 place-items-center rounded-md bg-warning text-warning-foreground shadow-md motion-safe:animate-bounce"
          aria-label={t("meetings.room.handRaised")}
          title={t("meetings.room.handRaised")}
        >
          <HandIcon className="size-4" />
        </span>
      )}

      {/* Pin — appears on hover / focus, always visible while pinned */}
      {pinnable && (
        <button
          type="button"
          {...pinProps}
          className={cn(
            "absolute top-2 end-2 grid size-8 place-items-center rounded-md bg-black/40 text-white opacity-0 backdrop-blur transition-opacity group-hover/tile:opacity-100 focus-visible:opacity-100",
            inFocus && "opacity-100",
          )}
          aria-label={
            inFocus ? t("meetings.room.unpin") : t("meetings.room.pin")
          }
          title={inFocus ? t("meetings.room.unpin") : t("meetings.room.pin")}
        >
          {inFocus ? (
            <PinOffIcon className="size-4" />
          ) : (
            <PinIcon className="size-4" />
          )}
        </button>
      )}
    </div>
  );
}
