import "server-only";

import { RoomServiceClient } from "livekit-server-sdk";

import { env } from "@/data/env/server";

/**
 * LiveKit's REST API (rooms, participants, data messages). One instance per
 * process — it holds no connection, only the credentials.
 *
 * `LIVEKIT_URL` is the WebSocket signalling URL the *browser* connects to;
 * the REST API lives on the same host over HTTP(S), which is what
 * `RoomServiceClient` expects.
 */
let cachedClient: RoomServiceClient | null = null;

export function getLiveKitConfig() {
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    throw new Error(
      "LiveKit is not configured — set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.",
    );
  }
  return {
    url: env.LIVEKIT_URL,
    apiKey: env.LIVEKIT_API_KEY,
    apiSecret: env.LIVEKIT_API_SECRET,
  };
}

export function getRoomService(): RoomServiceClient {
  if (cachedClient) return cachedClient;
  const { url, apiKey, apiSecret } = getLiveKitConfig();
  cachedClient = new RoomServiceClient(
    url.replace(/^ws/, "http"),
    apiKey,
    apiSecret,
  );
  return cachedClient;
}
