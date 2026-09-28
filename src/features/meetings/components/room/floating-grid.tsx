"use client";

import type { TrackReferenceOrPlaceholder } from "@livekit/components-core";
import {
  TrackRefContext,
  useParticipants,
  useSpeakingParticipants,
  useTracks,
} from "@livekit/components-react";
import { type Participant, Track } from "livekit-client";
import { HandIcon, MicOffIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { useTranslation } from "@/features/core/i18n/client";
import { meetingFlags } from "@/features/meetings/lib/meeting-flags";
import { PARTICIPANT_ATTRIBUTE_HAND_RAISED } from "@/integrations/livekit/attributes";
import { cn } from "@/lib/utils";
import { FloatingTileActions } from "./floating-tile-actions";
import { ParticipantTile } from "./participant-tile";
import { SelfMediaButtons } from "./self-media-buttons";
import {
  BannerButton,
  PauseButton,
  StopButton,
  useSharePause,
} from "./share-controls";
import { useHostMuteAll } from "./use-host-participant-actions";
import { WaitingQueue, type WaitingQueueState } from "./waiting-queue";

/** Above this many remote tiles the grid scrolls instead of shrinking. */
const SCROLL_AFTER = 4;

function isHandRaised(participant: Participant) {
  return participant.attributes[PARTICIPANT_ATTRIBUTE_HAND_RAISED] === "1";
}

/** Remembers the most recent remote speaker across silences. */
function useLastSpeakers() {
  const speaking = useSpeakingParticipants();
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    const now = speaking
      .filter((participant) => !participant.isLocal)
      .map((participant) => participant.identity);
    if (now.length === 0) return;
    setOrder((current) => [
      ...now,
      ...current.filter((identity) => !now.includes(identity)),
    ]);
  }, [speaking]);
  return order;
}

/**
 * Raised hands first, then whoever spoke most recently, then join order;
 * the sharer's own self-view always last.
 */
export function orderFloatingTiles(
  tracks: TrackReferenceOrPlaceholder[],
  speakerOrder: string[],
) {
  const rank = (identity: string) => {
    const index = speakerOrder.indexOf(identity);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return tracks
    .filter((track) => !track.participant.isLocal)
    .sort((a, b) => {
      const hand =
        Number(isHandRaised(b.participant)) -
        Number(isHandRaised(a.participant));
      if (hand !== 0) return hand;
      const spoke = rank(a.participant.identity) - rank(b.participant.identity);
      if (spoke !== 0) return spoke;
      return (
        (a.participant.joinedAt?.getTime() ?? 0) -
        (b.participant.joinedAt?.getTime() ?? 0)
      );
    });
}

type FloatingGridProps = {
  code: string;
  isHost: boolean;
  /** Extra footer content (the sharer's "people annotating" notice). */
  footerExtra?: ReactNode;
  /** Host only: the room's one waiting-queue poller, shown as a strip. */
  waitingQueue?: WaitingQueueState;
  /** A whole-screen share captures this window: keep knockers' names hidden. */
  isMonitorShare?: boolean;
};

/**
 * Everyone's camera — the sharer's own last, as a self-view — in a plain
 * CSS grid that adapts to the window, with pause and stop along the bottom
 * so the sharer never has to come back to the meeting tab to use them. The
 * host also gets per-person controls on each tile and "Mute all".
 */
export function FloatingGrid({
  code,
  isHost,
  footerExtra,
  waitingQueue,
  isMonitorShare = false,
}: FloatingGridProps) {
  const { t } = useTranslation();
  // Re-render on attribute changes (raised hands reorder the grid).
  useParticipants();
  const cameras = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const speakerOrder = useLastSpeakers();
  const remote = orderFloatingTiles(cameras, speakerOrder);
  const self = cameras.find((track) => track.participant.isLocal);
  const tracks = self ? [...remote, self] : remote;
  const pause = useSharePause();
  const hostControls = isHost && meetingFlags.pipHostControls;
  const hands = remote.filter((track) =>
    isHandRaised(track.participant),
  ).length;
  // Keys pressed in the floating window go to its own document.
  const [root, setRoot] = useState<HTMLDivElement | null>(null);

  return (
    <div
      ref={setRoot}
      className="meeting-room dark flex h-svh flex-col gap-1.5 bg-neutral-900 p-1.5 text-foreground"
    >
      {/* One polite announcer: knocks and admit results, never moving focus. */}
      <p aria-live="polite" className="sr-only">
        {hostControls ? waitingQueue?.announcement : null}
      </p>
      {hostControls && waitingQueue && (
        <WaitingQueue
          {...waitingQueue}
          variant="compact"
          hideNames={isMonitorShare}
        />
      )}
      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-1.5",
          remote.length > SCROLL_AFTER
            ? "auto-rows-[minmax(7rem,1fr)] overflow-y-auto"
            : "auto-rows-fr",
        )}
      >
        {remote.length === 0 && (
          <p className="place-self-center text-center text-sm text-neutral-400">
            {t("meetings.room.popOutEmpty")}
          </p>
        )}
        {tracks.map((track) => {
          const participant = track.participant;
          const canAct = hostControls && !participant.isLocal;
          return (
            <TrackRefContext.Provider
              key={`${participant.identity}-${track.source}`}
              value={track}
            >
              <ParticipantTile
                pinnable={false}
                className={cn(
                  isHandRaised(participant) &&
                    !participant.isLocal &&
                    "ring-warning",
                )}
                actions={
                  canAct ? (
                    <FloatingTileActions
                      code={code}
                      participant={participant}
                    />
                  ) : undefined
                }
              />
            </TrackRefContext.Provider>
          );
        })}
      </div>
      <SelfMediaButtons pipDocument={root?.ownerDocument ?? null}>
        {({ buttons, notice }) => (
          <>
            {notice}
            {/* One row, three groups; flex order mirrors in RTL. */}
            <div
              className={cn(
                "flex shrink-0 items-center gap-1.5 text-xs",
                pause.isPaused ? "text-warning" : "text-primary",
              )}
            >
              <span className="flex items-center gap-1">{buttons}</span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                {hostControls && remote.length > 0 && (
                  <MuteAllButton code={code} />
                )}
                {hostControls && hands > 0 && (
                  <span
                    className="flex items-center gap-1 text-warning"
                    title={t("meetings.host.handCount", { count: hands })}
                  >
                    <HandIcon className="size-3.5" aria-hidden />
                    <span className="max-[479px]:sr-only">
                      {t("meetings.host.handCount", { count: hands })}
                    </span>
                  </span>
                )}
                {footerExtra}
              </span>
              <span className="flex items-center gap-1 border-s border-white/15 ps-1.5">
                <PauseButton pause={pause} compact />
                <StopButton compact />
              </span>
            </div>
          </>
        )}
      </SelfMediaButtons>
    </div>
  );
}

function MuteAllButton({ code }: { code: string }) {
  const { t } = useTranslation();
  const muteAll = useHostMuteAll(code);
  return (
    <span className="flex min-w-0 items-center gap-2 text-neutral-200">
      <BannerButton
        onClick={muteAll.muteAll}
        disabled={muteAll.isPending}
        title={t("meetings.host.muteAll")}
      >
        <MicOffIcon className="size-3.5" aria-hidden />
        <span className="max-[479px]:sr-only">
          {t("meetings.host.muteAll")}
        </span>
      </BannerButton>
      {muteAll.status && (
        <span role="status" className="text-warning">
          {muteAll.status}
        </span>
      )}
    </span>
  );
}
