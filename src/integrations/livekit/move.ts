import "server-only";

import { DataPacket_Kind, TrackSource } from "livekit-server-sdk";

import { getRoomService } from "./client";
import { createMeetingToken, type MeetingRole } from "./token";

/** Data-channel topic carrying a "reconnect here" instruction to one participant. */
export const MOVE_TOPIC = "move";

export type MoveInstruction = { room: string; token: string };

/**
 * Moves one participant from one LiveKit room to another.
 *
 * LiveKit Cloud implements `MoveParticipant` natively — the connection is
 * migrated server-side and the browser sees `RoomEvent.Moved` with no
 * reconnect. The open-source server answers "not implemented", so there we
 * do the next best thing: mint a token for the destination, hand it to
 * exactly that participant over a reliable data message, and let the
 * client disconnect and reconnect itself (see `MeetingRoom`). Same result
 * either way; the person just sees a second of "Connecting…" on OSS.
 *
 * `role` is the *caller's* verdict (host identity from the database), never
 * read back from the participant: attributes are client-writable, so a
 * guest who set `role=host` on themself must not be minted a `roomAdmin`
 * token here.
 */
export async function moveParticipant(
  from: string,
  identity: string,
  to: string,
  role: MeetingRole,
): Promise<boolean> {
  const service = getRoomService();
  try {
    await service.moveParticipant(from, identity, to);
    return true;
  } catch (error) {
    if (!isNotImplemented(error)) {
      console.warn(`[livekit] move ${identity} ${from} -> ${to} failed`, error);
      return false;
    }
  }

  try {
    const participant = await service.getParticipant(from, identity);
    const token = await createMeetingToken({
      roomName: to,
      identity,
      name: participant.name || identity,
      role,
      canShareScreen:
        role === "host" ||
        (participant.permission?.canPublishSources ?? []).includes(
          TrackSource.SCREEN_SHARE,
        ),
    });
    const instruction: MoveInstruction = { room: to, token };
    await service.sendData(
      from,
      new TextEncoder().encode(JSON.stringify(instruction)),
      DataPacket_Kind.RELIABLE,
      { destinationIdentities: [identity], topic: MOVE_TOPIC },
    );
    return true;
  } catch (error) {
    console.warn(
      `[livekit] fallback move ${identity} ${from} -> ${to} failed`,
      error,
    );
    return false;
  }
}

function isNotImplemented(error: unknown): boolean {
  return error instanceof Error && /not implemented/i.test(error.message);
}
