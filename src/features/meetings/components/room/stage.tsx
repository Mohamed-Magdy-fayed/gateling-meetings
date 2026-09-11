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
  useTracks,
} from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import { useEffect, useRef } from "react";

import { ParticipantTile } from "./participant-tile";

/**
 * The video area. Grid by default; the moment someone shares a screen it is
 * pinned and the layout switches to focus + rail, and un-pins when the share
 * stops. A person can also pin any tile by hand (see `ParticipantTile`).
 * Mirrors the decision logic of LiveKit's `VideoConference` prefab, minus the
 * prefab's chrome.
 */
export function Stage() {
  const layoutContext = useCreateLayoutContext();

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false },
  );

  const screenShareTrack = tracks
    .filter(isTrackReference)
    .find((track) => track.publication.source === Track.Source.ScreenShare);

  const focusTrack = usePinnedTracks(layoutContext)[0];
  const carouselTracks = tracks.filter(
    (track) => !isEqualTrackRef(track, focusTrack),
  );

  // Auto-pin a new screen share; auto-unpin when it goes away. The ref
  // remembers which share *we* pinned so a manual pin is never overridden.
  const autoPinnedRef = useRef<TrackReferenceOrPlaceholder | null>(null);
  useEffect(() => {
    const { pin } = layoutContext;
    if (screenShareTrack && !focusTrack) {
      autoPinnedRef.current = screenShareTrack;
      pin.dispatch?.({ msg: "set_pin", trackReference: screenShareTrack });
      return;
    }
    if (
      !screenShareTrack &&
      autoPinnedRef.current &&
      isEqualTrackRef(focusTrack, autoPinnedRef.current)
    ) {
      autoPinnedRef.current = null;
      pin.dispatch?.({ msg: "clear_pin" });
    }
    // The focus track is a stale reference once the share ends — drop it.
    if (
      focusTrack &&
      isTrackReference(focusTrack) &&
      !tracks.some((track) => isEqualTrackRef(track, focusTrack))
    ) {
      pin.dispatch?.({ msg: "clear_pin" });
    }
  }, [screenShareTrack, focusTrack, layoutContext, tracks]);

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
