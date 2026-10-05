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
import { PictureInPicture2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { useTranslation } from "@/features/core/i18n/client";
import { useMeetingFeatures } from "@/features/meetings/components/meeting-features";
import { AnnotatingNotice } from "./annotations/sharer-controls";
import { FloatingGrid } from "./floating-grid";
import { usePictureInPicture } from "./use-picture-in-picture";
import type { WaitingQueueState } from "./waiting-queue";

export type PopOut = ReturnType<typeof usePopOut>;

/**
 * The room's one floating window. It opens by itself when the viewer
 * starts sharing; the host may also open it without sharing (top bar
 * button, or the browser's auto pop-out on switching tabs) to keep seeing
 * everyone — and the waiting queue — from other tabs and apps.
 */
export function usePopOut({ isHost }: { isHost: boolean }) {
  const { t } = useTranslation();
  const { isScreenShareEnabled } = useLocalParticipant();
  const { pipAnnotateAvailable } = useMeetingFeatures();
  const pip = usePictureInPicture({
    active: isScreenShareEnabled,
    allowIdle: isHost,
    // The host's window also carries the admit strip: give it room.
    large: pipAnnotateAvailable || isHost,
  });

  async function toggle() {
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

  return {
    ...pip,
    isSharing: isScreenShareEnabled,
    /** Host or sharer: the only people the floating window is for. */
    isAvailable: pip.mode != null && (isHost || isScreenShareEnabled),
    toggle,
  };
}

/** Top-bar "Pop out people" for the host when they are not sharing. */
export function PopOutButton({ popOut }: { popOut: PopOut }) {
  const { t } = useTranslation();
  if (!popOut.isAvailable || popOut.isSharing) return null;
  const label = popOut.isOpen
    ? t("meetings.room.popIn")
    : t("meetings.room.popOut");
  return (
    <button
      type="button"
      onClick={popOut.toggle}
      aria-pressed={popOut.isOpen}
      aria-label={label}
      title={popOut.isOpen ? label : t("meetings.room.popOutIdleHint")}
      className="flex items-center gap-1.5 rounded-md bg-white/[0.06] px-2 py-1 text-neutral-300 transition-colors hover:bg-white/[0.12] aria-pressed:bg-primary/20 aria-pressed:text-primary [&_svg]:size-3.5"
    >
      <PictureInPicture2Icon aria-hidden />
      <span className="max-sm:sr-only">{label}</span>
    </button>
  );
}

/** What is rendered into (or as) the floating window. */
export function PopOutWindow({
  popOut,
  code,
  isHost,
  isAnnotating,
  onAnnotatingChange,
  waitingQueue,
}: {
  popOut: PopOut;
  code: string;
  isHost: boolean;
  isAnnotating: boolean;
  onAnnotatingChange: (next: boolean) => void;
  /** Host only: the room's waiting queue, for the floating window's strip. */
  waitingQueue?: WaitingQueueState;
}) {
  const { localParticipant } = useLocalParticipant();
  if (!popOut.isAvailable) return null;
  const shareTrack = localParticipant.getTrackPublication(
    Track.Source.ScreenShare,
  )?.track;
  const isMonitorShare =
    popOut.isSharing &&
    shareTrack?.mediaStreamTrack.getSettings().displaySurface === "monitor";

  if (popOut.mode === "video") return <SpeakerVideo ref={popOut.videoRef} />;
  if (!popOut.pipWindow) return null;
  return createPortal(
    <FloatingGrid
      code={code}
      isHost={isHost}
      isSharing={popOut.isSharing}
      waitingQueue={waitingQueue}
      isMonitorShare={isMonitorShare}
      footerExtra={
        popOut.isSharing ? (
          <AnnotatingNotice
            isAnnotating={isAnnotating}
            onShow={() => onAnnotatingChange(true)}
          />
        ) : undefined
      }
    />,
    popOut.pipWindow.document.body,
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
