import { TrackSource } from "livekit-server-sdk";

import { userIdentity } from "@/integrations/livekit/identity";
import {
  breakoutMetadata,
  mergeRoomMetadata,
} from "@/integrations/livekit/room-metadata";

/**
 * Dependency-free pieces of the host procedures, kept out of the router so
 * they can be unit-tested without tRPC, a database or a LiveKit server.
 * The room service is passed in, typed only by the methods used.
 */

/**
 * Stable reasons a host action was refused, sent to the browser in the
 * tRPC error data (see `errorFormatter`) so it can show a translated
 * message without parsing text.
 */
export type HostActionErrorCode =
  | "NOT_HOST"
  | "SELF_TARGET"
  | "FOREIGN_ROOM"
  | "PARTICIPANT_NOT_FOUND";

export class HostActionError extends Error {
  constructor(readonly code: HostActionErrorCode) {
    super(code);
    this.name = "HostActionError";
  }
}

export function hostActionErrorData(
  cause: unknown,
): HostActionErrorCode | null {
  return cause instanceof HostActionError ? cause.code : null;
}

/** A host acting on themself (mute, camera off, remove) is refused. */
export function isSelfTarget(identity: string, userId: string): boolean {
  return identity === userIdentity(userId);
}

/**
 * Which LiveKit room a host action targets. Omitted means the main meeting
 * room; otherwise it must be the main room or one of the meeting's open
 * breakouts, never an arbitrary room the host happens to name.
 */
export function resolveTargetRoom(
  meetingCode: string,
  roomName: string | undefined,
  openBreakoutRoomNames: readonly string[],
): string {
  if (roomName == null || roomName === meetingCode) return meetingCode;
  if (openBreakoutRoomNames.includes(roomName)) return roomName;
  throw new HostActionError("FOREIGN_ROOM");
}

/**
 * LiveKit's REST API answers a missing room or participant with a Twirp
 * `not_found` error (HTTP 404). Matched on the code, never the message.
 */
export function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, status } = error as { code?: unknown; status?: unknown };
  return code === "not_found" || status === 404;
}

/** Rethrows LiveKit's not-found as `PARTICIPANT_NOT_FOUND`; anything else as is. */
export async function mapParticipantNotFound<T>(
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new HostActionError("PARTICIPANT_NOT_FOUND");
    }
    throw error;
  }
}

type TrackInfo = { sid: string; source: TrackSource; muted: boolean };

export type MuteService = {
  getParticipant(
    room: string,
    identity: string,
  ): Promise<{ tracks: TrackInfo[] }>;
  mutePublishedTrack(
    room: string,
    identity: string,
    trackSid: string,
    muted: boolean,
  ): Promise<unknown>;
};

export type MutableSource = "microphone" | "camera";

const TRACK_SOURCE: Record<MutableSource, TrackSource> = {
  microphone: TrackSource.MICROPHONE,
  camera: TrackSource.CAMERA,
};

/**
 * Mutes every unmuted track of one source at the SFU. The person can turn
 * it back on themself; the host can only ask (see `host-request-prompt`).
 * `changed: false` means there was nothing on to turn off.
 */
export async function muteSource(
  service: MuteService,
  roomName: string,
  identity: string,
  source: MutableSource,
): Promise<{ changed: boolean }> {
  const participant = await mapParticipantNotFound(() =>
    service.getParticipant(roomName, identity),
  );
  const live = participant.tracks.filter(
    (track) => track.source === TRACK_SOURCE[source] && !track.muted,
  );
  await mapParticipantNotFound(() =>
    Promise.all(
      live.map((track) =>
        service.mutePublishedTrack(roomName, identity, track.sid, true),
      ),
    ),
  );
  return { changed: live.length > 0 };
}

export type MetadataService = {
  listRooms(names?: string[]): Promise<{ name: string; metadata: string }[]>;
  updateRoomMetadata(room: string, metadata: string): Promise<unknown>;
};

export type LiveSync = "ok" | "skipped" | "failed";

type OpenBreakout = { name: string; liveKitRoomName: string };

/**
 * Pushes `allowAnnotations` into the live rooms so participants' clients
 * see it without rejoining. The main room's metadata is merged (other keys
 * kept); each open breakout's is rebuilt from its database row, never
 * merged over LiveKit's copy, so a stale read can't resurrect old values.
 *
 * Never throws: a room that doesn't exist (nobody has joined yet) is
 * skipped; any other failure is logged and reported as `failed`.
 */
export async function publishAllowAnnotations(
  service: MetadataService,
  meetingCode: string,
  openBreakouts: readonly OpenBreakout[],
  allowAnnotations: boolean,
  log: (message: string, error: unknown) => void = console.error,
): Promise<LiveSync> {
  let result: LiveSync = "skipped";
  const note = (outcome: LiveSync) => {
    if (outcome === "failed" || result === "failed") result = "failed";
    else if (outcome === "ok") result = "ok";
  };

  async function write(roomName: string, metadata: () => Promise<string>) {
    try {
      await service.updateRoomMetadata(roomName, await metadata());
      note("ok");
    } catch (error) {
      if (isNotFoundError(error)) return;
      log(`[meetings] ${meetingCode}: room metadata write failed`, error);
      note("failed");
    }
  }

  await write(meetingCode, async () => {
    const [room] = await service.listRooms([meetingCode]);
    if (!room) throw Object.assign(new Error("room"), { code: "not_found" });
    return mergeRoomMetadata(room.metadata, { allowAnnotations });
  });
  for (const breakout of openBreakouts) {
    await write(breakout.liveKitRoomName, async () =>
      breakoutMetadata(breakout.name, meetingCode, allowAnnotations),
    );
  }
  return result;
}
