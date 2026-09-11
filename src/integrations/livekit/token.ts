import "server-only";

import { AccessToken, TrackSource, type VideoGrant } from "livekit-server-sdk";

import { PARTICIPANT_ATTRIBUTE_ROLE } from "./attributes";
import { getLiveKitConfig } from "./client";

export type MeetingRole = "host" | "participant";

/**
 * A token is only used to *connect*; once in the room the session outlives
 * it. Two hours covers a pre-join screen left open over lunch without
 * handing out a credential that stays valid all day.
 */
const TOKEN_TTL = "2h";

export type CreateMeetingTokenOptions = {
  roomName: string;
  identity: string;
  name: string;
  role: MeetingRole;
  /** `false` blocks screen share at the SFU, not just in the UI. */
  canShareScreen: boolean;
};

/**
 * The single place that maps a meeting role onto LiveKit grants. Roles come
 * from the token, never from client state — a participant who edits the DOM
 * to show host controls still can't mute anyone, because the SFU checks
 * `roomAdmin` on every admin RPC.
 */
export async function createMeetingToken({
  roomName,
  identity,
  name,
  role,
  canShareScreen,
}: CreateMeetingTokenOptions): Promise<string> {
  const { apiKey, apiSecret } = getLiveKitConfig();

  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name,
    ttl: TOKEN_TTL,
    attributes: { [PARTICIPANT_ATTRIBUTE_ROLE]: role },
  });

  const publishSources = [TrackSource.CAMERA, TrackSource.MICROPHONE];
  if (canShareScreen) {
    publishSources.push(
      TrackSource.SCREEN_SHARE,
      TrackSource.SCREEN_SHARE_AUDIO,
    );
  }

  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishSources: publishSources,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
    roomAdmin: role === "host",
  };

  token.addGrant(grant);
  return token.toJwt();
}
