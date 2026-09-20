"use client";

import {
  isEqualTrackRef,
  isTrackReference,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-core";
import {
  CarouselLayout,
  FocusLayoutContainer,
  GridLayout,
  LayoutContextProvider,
  TrackRefContext,
  useCreateLayoutContext,
  usePinnedTracks,
  useSpeakingParticipants,
  useTracks,
} from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import { useEffect, useRef, useState } from "react";

import { ParticipantTile } from "./participant-tile";

export type StageLayout = "grid" | "speaker";

/**
 * The video area. Grid by default; the moment someone shares a screen it is
 * pinned and the layout switches to focus + rail, and un-pins when the share
 * stops. A person can also pin any tile by hand (see `ParticipantTile`).
 * "Speaker" layout keeps the focus slot on whoever spoke last (a manual pin
 * or a screen share still wins). Mirrors the decision logic of LiveKit's
 * `VideoConference` prefab, minus the prefab's chrome.
 */
export function Stage({ layout }: { layout: StageLayout }) {
  const layoutContext = useCreateLayoutContext();

  const allTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false },
  );
  // The sharer's own screen is kept off their stage: it would only mirror
  // what they already see (an infinite tunnel when it is the browser) and
  // take the room away from the people they are presenting to. Everyone
  // else still gets it pinned; the sharer gets a banner (SharingBanner).
  const tracks = allTracks.filter(
    (track) =>
      !(track.source === Track.Source.ScreenShare && track.participant.isLocal),
  );

  const screenShareTrack = tracks
    .filter(isTrackReference)
    .find((track) => track.publication.source === Track.Source.ScreenShare);

  const pinnedTrack = usePinnedTracks(layoutContext)[0];

  // Speaker layout: remember the last person who spoke so the focus slot
  // doesn't flicker back to nobody during pauses.
  const speaking = useSpeakingParticipants();
  const [lastSpeakerIdentity, setLastSpeakerIdentity] = useState<string | null>(
    null,
  );
  useEffect(() => {
    const remote = speaking.find((participant) => !participant.isLocal);
    if (remote) setLastSpeakerIdentity(remote.identity);
  }, [speaking]);

  const speakerTrack =
    layout === "speaker"
      ? (tracks.find(
          (track) =>
            track.source === Track.Source.Camera &&
            track.participant.identity === lastSpeakerIdentity,
        ) ??
        tracks.find(
          (track) =>
            track.source === Track.Source.Camera && !track.participant.isLocal,
        ))
      : undefined;

  const focusTrack = pinnedTrack ?? speakerTrack;
  const carouselTracks = tracks.filter(
    (track) => !isEqualTrackRef(track, focusTrack),
  );

  // Auto-pin a new screen share; auto-unpin when it goes away. The ref
  // remembers which share *we* pinned so a manual pin is never overridden.
  const autoPinnedRef = useRef<TrackReferenceOrPlaceholder | null>(null);
  useEffect(() => {
    const { pin } = layoutContext;
    if (screenShareTrack && !pinnedTrack) {
      autoPinnedRef.current = screenShareTrack;
      pin.dispatch?.({ msg: "set_pin", trackReference: screenShareTrack });
      return;
    }
    if (
      !screenShareTrack &&
      autoPinnedRef.current &&
      isEqualTrackRef(pinnedTrack, autoPinnedRef.current)
    ) {
      autoPinnedRef.current = null;
      pin.dispatch?.({ msg: "clear_pin" });
    }
    // The pinned track is a stale reference once its owner left — drop it.
    if (
      pinnedTrack &&
      isTrackReference(pinnedTrack) &&
      !tracks.some((track) => isEqualTrackRef(track, pinnedTrack))
    ) {
      pin.dispatch?.({ msg: "clear_pin" });
    }
  }, [screenShareTrack, pinnedTrack, layoutContext, tracks]);

  return (
    <LayoutContextProvider value={layoutContext}>
      <div className="relative min-h-0 flex-1">
        {focusTrack ? (
          <FocusLayoutContainer>
            <CarouselLayout tracks={carouselTracks}>
              <ParticipantTile />
            </CarouselLayout>
            {/* LiveKit's FocusLayout renders its own prefab tile; we want ours. */}
            <TrackRefContext.Provider value={focusTrack}>
              <ParticipantTile className="lk-focus-layout-stage" />
            </TrackRefContext.Provider>
          </FocusLayoutContainer>
        ) : (
          <GridLayout tracks={tracks}>
            <ParticipantTile />
          </GridLayout>
        )}
      </div>
    </LayoutContextProvider>
  );
}
