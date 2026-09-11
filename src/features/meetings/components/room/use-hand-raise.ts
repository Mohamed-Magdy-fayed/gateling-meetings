"use client";

import {
  useLocalParticipant,
  useParticipantAttribute,
} from "@livekit/components-react";
import type { Participant } from "livekit-client";

import { PARTICIPANT_ATTRIBUTE_HAND_RAISED } from "@/integrations/livekit/attributes";

/** Whether the given participant's hand is up (any participant). */
export function useHandRaised(participant?: Participant): boolean {
  const value = useParticipantAttribute(PARTICIPANT_ATTRIBUTE_HAND_RAISED, {
    participant,
  });
  return value === "1";
}

/**
 * Hand raise rides on the local participant's *attributes*, which LiveKit
 * replicates to everyone and keeps across reconnects — no server call, and
 * the host can lower it remotely via `RoomServiceClient.updateParticipant`.
 */
export function useLocalHandRaise() {
  const { localParticipant } = useLocalParticipant();
  const isRaised = useHandRaised(localParticipant);

  async function toggle() {
    await localParticipant.setAttributes({
      [PARTICIPANT_ATTRIBUTE_HAND_RAISED]: isRaised ? "" : "1",
    });
  }

  return { isRaised, toggle };
}
