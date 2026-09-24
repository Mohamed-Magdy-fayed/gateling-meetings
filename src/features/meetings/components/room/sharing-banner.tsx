"use client";

import {
  isTrackReference,
  type TrackReference,
} from "@livekit/components-core";
import {
  TrackRefContext,
  useLocalParticipant,
  useSpeakingParticipants,
  useTrackMutedIndicator,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import {
  PauseIcon,
  PictureInPicture2Icon,
  PlayIcon,
  ScreenShareIcon,
  ScreenShareOffIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { useTranslation } from "@/features/core/i18n/client";
import { cn } from "@/lib/utils";
import { ParticipantTile } from "./participant-tile";
import { usePictureInPicture } from "./use-picture-in-picture";

/**
 * Pausing mutes the share rather than unpublishing it: the capture session
 * stays alive (LiveKit only stops the underlying track for cameras), so
 * resuming never brings the browser's picker back, and viewers keep the
 * share pinned with a "paused" placeholder instead of a frozen frame.
 */
function useSharePause() {
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

/**
 * Shown to whoever is sharing their screen. Their own share is kept off
 * their stage (see `Stage`), so this strip is the reminder that they are
 * sharing, the way to pause or stop, and the way to pop the participants
 * (themselves included) out into a floating window that stays on top of
 * whatever they are showing.
 */
export function SharingBanner() {
  const { t } = useTranslation();
  const { isScreenShareEnabled } = useLocalParticipant();
  const pip = usePictureInPicture({ active: isScreenShareEnabled });
  const pause = useSharePause();

  if (!isScreenShareEnabled) return null;

  async function togglePopOut() {
    if (pip.isOpen) {
      pip.close();
      return;
    }
    try {
      await pip.open();
    } catch {
      toast.error(t("meetings.room.popOutUnavailable"));
    }
  }

  return (
    <>
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
        {pip.mode && (
          <BannerButton
            onClick={togglePopOut}
            title={pip.isOpen ? undefined : t("meetings.room.popOutHint")}
          >
            <PictureInPicture2Icon className="size-3.5" aria-hidden />
            {pip.isOpen ? t("meetings.room.popIn") : t("meetings.room.popOut")}
          </BannerButton>
        )}
        <StopButton />
      </div>

      {pip.mode === "document" &&
        pip.pipWindow &&
        createPortal(<FloatingGrid />, pip.pipWindow.document.body)}
      {pip.mode === "video" && <SpeakerVideo ref={pip.videoRef} />}
    </>
  );
}

function BannerButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors hover:bg-current/15 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    />
  );
}

function PauseButton({ pause }: { pause: ReturnType<typeof useSharePause> }) {
  const { t } = useTranslation();
  return (
    <BannerButton onClick={() => void pause.toggle()} disabled={pause.pending}>
      {pause.isPaused ? (
        <PlayIcon className="size-3.5" aria-hidden />
      ) : (
        <PauseIcon className="size-3.5" aria-hidden />
      )}
      {pause.isPaused
        ? t("meetings.room.resumeSharing")
        : t("meetings.room.pauseSharing")}
    </BannerButton>
  );
}

function StopButton() {
  const { t } = useTranslation();
  const { localParticipant } = useLocalParticipant();
  return (
    <BannerButton
      onClick={() => void localParticipant.setScreenShareEnabled(false)}
      className="text-destructive hover:bg-destructive/15"
    >
      <ScreenShareOffIcon className="size-3.5" aria-hidden />
      {t("meetings.room.stopSharing")}
    </BannerButton>
  );
}

function useCameras() {
  return useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false,
  });
}

function useRemoteCameras() {
  return useCameras().filter((track) => !track.participant.isLocal);
}

/**
 * Everyone's camera — the sharer's own last, as a self-view — in a plain
 * CSS grid that adapts to the window, with pause and stop along the bottom
 * so the sharer never has to come back to the meeting tab to use them.
 */
function FloatingGrid() {
  const { t } = useTranslation();
  const cameras = useCameras();
  const remote = cameras.filter((track) => !track.participant.isLocal);
  const self = cameras.find((track) => track.participant.isLocal);
  const tracks = self ? [...remote, self] : remote;
  const pause = useSharePause();

  return (
    <div className="meeting-room dark flex h-svh flex-col gap-1.5 bg-neutral-900 p-1.5 text-foreground">
      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-1.5">
        {remote.length === 0 && (
          <p className="place-self-center text-center text-sm text-neutral-400">
            {t("meetings.room.popOutEmpty")}
          </p>
        )}
        {tracks.map((track) => (
          <TrackRefContext.Provider
            key={`${track.participant.identity}-${track.source}`}
            value={track}
          >
            <ParticipantTile pinnable={false} />
          </TrackRefContext.Provider>
        ))}
      </div>
      <div
        className={cn(
          "flex shrink-0 flex-wrap items-center justify-center gap-2 text-xs",
          pause.isPaused ? "text-warning" : "text-primary",
        )}
      >
        <PauseButton pause={pause} />
        <StopButton />
      </div>
    </div>
  );
}

/**
 * Classic picture-in-picture floats one `<video>`, so this one follows the
 * last remote person who spoke (falling back to anyone with a camera on).
 * The element itself never changes — only the track attached to it — so
 * the floating window survives speaker changes. It sits, invisible, at the
 * top corner of the viewport rather than off-screen: LiveKit's adaptive
 * stream stops sending video to elements it considers out of view.
 */
function SpeakerVideo({ ref }: { ref: React.Ref<HTMLVideoElement> }) {
  const tracks = useRemoteCameras().filter(
    (track): track is TrackReference =>
      isTrackReference(track) && !track.publication.isMuted,
  );
  const speaking = useSpeakingParticipants();
  const [lastSpeaker, setLastSpeaker] = useState<string | null>(null);
  useEffect(() => {
    const remote = speaking.find((participant) => !participant.isLocal);
    if (remote) setLastSpeaker(remote.identity);
  }, [speaking]);

  const featured =
    tracks.find((track) => track.participant.identity === lastSpeaker) ??
    tracks[0];
  const track = featured?.publication.track;

  const innerRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = innerRef.current;
    if (!video || !track) return;
    track.attach(video);
    return () => {
      track.detach(video);
    };
  }, [track]);

  return (
    <video
      ref={(element) => {
        innerRef.current = element;
        if (typeof ref === "function") ref(element);
        else if (ref) ref.current = element;
      }}
      muted
      autoPlay
      playsInline
      aria-hidden
      className="pointer-events-none fixed top-0 start-0 aspect-video w-80 opacity-0"
    />
  );
}
