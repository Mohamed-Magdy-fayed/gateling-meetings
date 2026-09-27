/**
 * The JSON the server stores in a LiveKit room's metadata. Room metadata is
 * written only through `RoomServiceClient` (never by a participant), so the
 * browser can trust it for room-wide switches. Shared by the server writers
 * and the browser reader, so this file must stay import-safe on both.
 *
 * - `breakout` / `main`: set on breakout rooms (see `breakoutMetadata`).
 * - `allowAnnotations`: the live copy of the meeting setting. A missing key
 *   means `true`, the setting's default.
 */
export type RoomMetadata = {
  allowAnnotations?: boolean;
  breakout?: string;
  main?: string;
};

function parseObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** The known keys, each dropped when it has the wrong type. Never throws. */
export function parseRoomMetadata(
  raw: string | null | undefined,
): RoomMetadata {
  const parsed = parseObject(raw);
  const result: RoomMetadata = {};
  if (typeof parsed.allowAnnotations === "boolean") {
    result.allowAnnotations = parsed.allowAnnotations;
  }
  if (typeof parsed.breakout === "string") result.breakout = parsed.breakout;
  if (typeof parsed.main === "string") result.main = parsed.main;
  return result;
}

/**
 * Read-modify-write: applies `patch` over the existing metadata, keeping
 * every key it does not name (including ones this version doesn't know).
 * Unparseable existing metadata is replaced.
 */
export function mergeRoomMetadata(
  raw: string | null | undefined,
  patch: RoomMetadata,
): string {
  return JSON.stringify({ ...parseObject(raw), ...patch });
}

/** A breakout room's metadata, rebuilt from the database row every time. */
export function breakoutMetadata(
  name: string,
  mainRoom: string,
  allowAnnotations: boolean,
): string {
  return JSON.stringify({
    breakout: name,
    main: mainRoom,
    allowAnnotations,
  } satisfies RoomMetadata);
}

/** A missing key means the setting's default (on). */
export function annotationsAllowed(metadata: RoomMetadata): boolean {
  return metadata.allowAnnotations !== false;
}
