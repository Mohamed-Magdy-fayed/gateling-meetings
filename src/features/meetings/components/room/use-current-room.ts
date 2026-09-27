"use client";

import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import { useEffect, useState } from "react";

import {
  annotationsAllowed,
  parseRoomMetadata,
} from "@/integrations/livekit/room-metadata";

export type CurrentRoom = {
  name: string;
  /** From `breakoutMetadata()` on the server; null in the main room. */
  breakout: { name: string; main: string } | null;
  /** The live copy of the meeting setting (room metadata; missing = on). */
  allowAnnotations: boolean;
};

function read(room: { name: string; metadata?: string }): CurrentRoom {
  const metadata = parseRoomMetadata(room.metadata);
  return {
    name: room.name,
    breakout:
      metadata.breakout && metadata.main
        ? { name: metadata.breakout, main: metadata.main }
        : null,
    allowAnnotations: annotationsAllowed(metadata),
  };
}

/**
 * Which LiveKit room this connection is in *right now*. A server-side move
 * (breakouts) swaps the room underneath the same connection and fires
 * `RoomEvent.Moved`; nothing else in the component tree re-renders for
 * that on its own, so the banner reads from here.
 */
export function useCurrentRoom(): CurrentRoom {
  const room = useRoomContext();
  const [current, setCurrent] = useState<CurrentRoom>(() => read(room));

  useEffect(() => {
    const update = () => setCurrent(read(room));
    update();
    room.on(RoomEvent.Moved, update);
    room.on(RoomEvent.Connected, update);
    room.on(RoomEvent.RoomMetadataChanged, update);
    return () => {
      room.off(RoomEvent.Moved, update);
      room.off(RoomEvent.Connected, update);
      room.off(RoomEvent.RoomMetadataChanged, update);
    };
  }, [room]);

  return current;
}
