"use client";

import {
  isTrackReference,
  type TrackReference,
} from "@livekit/components-core";
import {
  TrackRefContext,
  useLocalParticipant,
  useSpeakingParticipants,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import {
  PictureInPicture2Icon,
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
 * Shown to whoever is sharing their screen. Their own share is kept off
 * their stage (see `Stage`), so this strip is the reminder that they are
 * sharing, the way to stop, and the way to pop the other participants out
 * into a floating window that stays on top of whatever they are showing.
 */
export function SharingBanner() {
  const { t } = useTranslation();
  const { isScreenShareEnabled, localParticipant } = useLocalParticipant();
  const pip = usePictureInPicture({ active: isScreenShareEnabled });

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
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-primary/15 px-3 py-1.5 text-xs text-primary">
        <ScreenShareIcon className="size-4" />
        <span>{t("meetings.room.youAreSharing")}</span>
        {pip.mode && (
          <BannerButton
            onClick={togglePopOut}
            title={pip.isOpen ? undefined : t("meetings.room.popOutHint")}
          >
            <PictureInPicture2Icon className="size-3.5" />
            {pip.isOpen ? t("meetings.room.popIn") : t("meetings.room.popOut")}
          </BannerButton>
        )}
        <BannerButton
          onClick={() => void localParticipant.setScreenShareEnabled(false)}
          className="text-destructive hover:bg-destructive/15"
        >
          <ScreenShareOffIcon className="size-3.5" />
          {t("meetings.room.stopSharing")}
        </BannerButton>
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
        "flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors hover:bg-primary/15",
        className,
      )}
    />
  );
}

/** Everyone else's camera, in a plain CSS grid that adapts to the window. */
function useRemoteCameras() {
  return useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false,
  }).filter((track) => !track.participant.isLocal);
}

function FloatingGrid() {
  const { t } = useTranslation();
  const tracks = useRemoteCameras();

  return (
    <div className="meeting-room dark grid h-svh auto-rows-fr grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-1.5 bg-neutral-900 p-1.5 text-foreground">
      {tracks.length === 0 ? (
        <p className="place-self-center text-center text-sm text-neutral-400">
          {t("meetings.room.popOutEmpty")}
        </p>
      ) : (
        tracks.map((track) => (
          <TrackRefContext.Provider
            key={`${track.participant.identity}-${track.source}`}
            value={track}
          >
            <ParticipantTile pinnable={false} />
          </TrackRefContext.Provider>
        ))
      )}
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
