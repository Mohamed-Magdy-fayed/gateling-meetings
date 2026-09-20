"use client";

import { useLocalParticipant } from "@livekit/components-react";
import type { LocalAudioTrack } from "livekit-client";

/** The microphone track we are publishing right now, if any. */
export function useLocalMicTrack(): LocalAudioTrack | undefined {
  const { microphoneTrack } = useLocalParticipant();
  const track = microphoneTrack?.track;
  return track && track.kind === "audio"
    ? (track as LocalAudioTrack)
    : undefined;
}
