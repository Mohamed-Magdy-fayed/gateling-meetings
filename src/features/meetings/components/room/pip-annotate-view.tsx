"use client";

import { useLocalParticipant } from "@livekit/components-react";
import { Track } from "livekit-client";
import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/features/core/i18n/client";
import { AnnotationLayer } from "./annotations/overlay";
import { useSharePause } from "./share-controls";

/** Shares whose hint was dismissed (or shown): once per share, per page. */
const hintSeen = new Set<string>();

/**
 * Experimental (`pipAnnotateAvailable`, Settings → Features): the presenter's own
 * share inside the floating window, with the regular annotation layer on
 * top, so they can see everyone's ink and point or draw without going back
 * to the meeting tab. Drawing over the real desktop is not possible from a
 * browser; viewers see the ink on the shared screen.
 *
 * The view owns its `<video>` (in the floating window's document) and only
 * ever detaches the share track from that element — never `detach()` with
 * no argument, which would also blank the meeting tab's preview.
 */
export function PipAnnotateView({
  isMonitorShare,
}: {
  isMonitorShare: boolean;
}) {
  const { t } = useTranslation();
  const { localParticipant } = useLocalParticipant();
  const publication = localParticipant.getTrackPublication(
    Track.Source.ScreenShare,
  );
  const track = publication?.track;
  const shareSid = publication?.trackSid;
  const pause = useSharePause();

  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    if (!video || !track) return;
    const onReady = () => setIsReady(video.videoWidth > 0);
    video.addEventListener("loadedmetadata", onReady);
    track.attach(video);
    onReady();
    return () => {
      video.removeEventListener("loadedmetadata", onReady);
      track.detach(video);
      setIsReady(false);
    };
  }, [video, track]);

  const [isHintShown, setIsHintShown] = useState(
    () => shareSid != null && !hintSeen.has(shareSid),
  );
  useEffect(() => {
    if (shareSid) hintSeen.add(shareSid);
  }, [shareSid]);

  if (!shareSid) return null;
  const isPaused = pause.isPaused;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      {isHintShown && (
        <p className="flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground max-[300px]:hidden">
          <span className="min-w-0 flex-1">
            {isMonitorShare
              ? t("meetings.pip.monitorNote")
              : t("meetings.pip.annotateHint")}
          </span>
          <button
            type="button"
            aria-label={t("meetings.pip.dismiss")}
            className="grid size-8 place-items-center rounded-md hover:bg-current/15 focus-visible:outline-2 focus-visible:outline-current"
            onClick={() => setIsHintShown(false)}
          >
            <XIcon className="size-3.5" aria-hidden />
          </button>
        </p>
      )}
      {/* The annotation surface is frame space: an LTR island. */}
      <div
        dir="ltr"
        className="relative min-h-[60%] flex-1 overflow-hidden rounded-md bg-black"
      >
        <video
          ref={setVideo}
          muted
          autoPlay
          playsInline
          aria-hidden
          className="absolute inset-0 size-full object-contain"
        />
        {!isReady && !isPaused && (
          <Skeleton className="absolute inset-0 rounded-md bg-muted/40" />
        )}
        {(isReady || isPaused) && (
          <AnnotationLayer
            video={isPaused ? null : video}
            shareSid={shareSid}
            isOwnShare
            initialTool="laser"
            toolbarVariant="rail"
          />
        )}
      </div>
    </div>
  );
}
