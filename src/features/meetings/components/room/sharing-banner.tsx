"use client";

import {
  isTrackReference,
  type TrackReference,
} from "@livekit/components-core";
import {
  useLocalParticipant,
  useSpeakingParticipants,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import {
  PauseIcon,
  PictureInPicture2Icon,
  ScreenShareIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { useTranslation } from "@/features/core/i18n/client";
import { cn } from "@/lib/utils";
import { FloatingGrid } from "./floating-grid";
import {
  BannerButton,
  PauseButton,
  StopButton,
  useSharePause,
} from "./share-controls";
import { usePictureInPicture } from "./use-picture-in-picture";

type SharingBannerProps = { code: string; isHost: boolean };

/**
 * Shown to whoever is sharing their screen. Their own share is kept off
 * their stage (see `Stage`), so this strip is the reminder that they are
 * sharing, the way to pause or stop, and the way to pop the participants
 * (themselves included) out into a floating window that stays on top of
 * whatever they are showing.
 */
export function SharingBanner({ code, isHost }: SharingBannerProps) {
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
        createPortal(
          <FloatingGrid code={code} isHost={isHost} />,
          pip.pipWindow.document.body,
        )}
      {pip.mode === "video" && <SpeakerVideo ref={pip.videoRef} />}
    </>
  );
}

function useRemoteCameras() {
  return useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false,
  }).filter((track) => !track.participant.isLocal);
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
