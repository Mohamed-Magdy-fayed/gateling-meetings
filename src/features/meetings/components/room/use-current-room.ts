"use client";

import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import { useEffect, useState } from "react";

export type CurrentRoom = {
  name: string;
  /** From `breakoutMetadata()` on the server; null in the main room. */
  breakout: { name: string; main: string } | null;
};

function read(room: { name: string; metadata?: string }): CurrentRoom {
  let breakout: CurrentRoom["breakout"] = null;
  if (room.metadata) {
    try {
      const parsed = JSON.parse(room.metadata) as Partial<{
        breakout: string;
        main: string;
      }>;
      if (parsed.breakout && parsed.main) {
        breakout = { name: parsed.breakout, main: parsed.main };
      }
    } catch {
      // Not ours — some other metadata shape.
    }
  }
  return { name: room.name, breakout };
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
