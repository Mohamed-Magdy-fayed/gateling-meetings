import { TrackSource } from "livekit-server-sdk";
import { describe, expect, test, vi } from "vitest";
import { isFlagOn } from "@/features/meetings/lib/flags";
import {
  HostActionError,
  hostActionErrorData,
  isNotFoundError,
  isSelfTarget,
  type MetadataService,
  type MuteService,
  muteSource,
  publishAllowAnnotations,
  resolveTargetRoom,
} from "@/features/meetings/server/host-actions";

function notFound() {
  return Object.assign(new Error("requested participant not found"), {
    code: "not_found",
    status: 404,
  });
}

describe("isSelfTarget", () => {
  test("matches the caller's own user identity only", () => {
    expect(isSelfTarget("user:abc", "abc")).toBe(true);
    expect(isSelfTarget("user:abcd", "abc")).toBe(false);
    expect(isSelfTarget("guest:abc", "abc")).toBe(false);
  });
});

describe("resolveTargetRoom", () => {
  const code = "abc-defg-hij";

  test("omitted or the meeting code means the main room", () => {
    expect(resolveTargetRoom(code, undefined, [])).toBe(code);
    expect(resolveTargetRoom(code, code, [])).toBe(code);
  });

  test("accepts one of the meeting's open breakouts", () => {
    expect(resolveTargetRoom(code, `${code}:b2`, [`${code}:b2`])).toBe(
      `${code}:b2`,
    );
  });

  test("rejects any other room with FOREIGN_ROOM", () => {
    const attempt = () =>
      resolveTargetRoom(code, "zzz-zzzz-zzz:b1", [`${code}:b1`]);
    expect(attempt).toThrow(HostActionError);
    try {
      attempt();
    } catch (error) {
      expect(hostActionErrorData(error)).toBe("FOREIGN_ROOM");
    }
  });
});

describe("isNotFoundError", () => {
  test("matches the Twirp code or HTTP status, not the message", () => {
    expect(isNotFoundError(notFound())).toBe(true);
    expect(isNotFoundError({ status: 404 })).toBe(true);
    expect(isNotFoundError(new Error("not found"))).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
  });
});

function muteService(
  tracks: { sid: string; source: TrackSource; muted: boolean }[],
) {
  return {
    getParticipant: vi.fn(async () => ({ tracks })),
    mutePublishedTrack: vi.fn(async () => ({})),
  } satisfies MuteService;
}

describe("muteSource", () => {
  test("mutes only unmuted tracks of the requested source", async () => {
    const service = muteService([
      { sid: "mic", source: TrackSource.MICROPHONE, muted: false },
      { sid: "cam", source: TrackSource.CAMERA, muted: false },
      { sid: "cam2", source: TrackSource.CAMERA, muted: true },
    ]);
    const result = await muteSource(service, "room", "guest:1", "camera");
    expect(result).toEqual({ changed: true });
    expect(service.mutePublishedTrack).toHaveBeenCalledTimes(1);
    expect(service.mutePublishedTrack).toHaveBeenCalledWith(
      "room",
      "guest:1",
      "cam",
      true,
    );
  });

  test("reports changed: false when nothing was on", async () => {
    const service = muteService([
      { sid: "mic", source: TrackSource.MICROPHONE, muted: true },
    ]);
    expect(await muteSource(service, "room", "guest:1", "microphone")).toEqual({
      changed: false,
    });
    expect(service.mutePublishedTrack).not.toHaveBeenCalled();
  });

  test("maps LiveKit not-found to PARTICIPANT_NOT_FOUND", async () => {
    const service = {
      getParticipant: vi.fn(async () => {
        throw notFound();
      }),
      mutePublishedTrack: vi.fn(),
    } satisfies MuteService;
    await expect(
      muteSource(service, "room", "guest:gone", "microphone"),
    ).rejects.toMatchObject({ code: "PARTICIPANT_NOT_FOUND" });
  });
});

function metadataService(
  rooms: Record<string, string>,
  failFor: Record<string, Error> = {},
) {
  const writes: Record<string, string> = {};
  const service: MetadataService = {
    async listRooms(names) {
      return (names ?? [])
        .filter((name) => name in rooms)
        .map((name) => ({ name, metadata: rooms[name] ?? "" }));
    },
    async updateRoomMetadata(room, metadata) {
      const failure = failFor[room];
      if (failure) throw failure;
      writes[room] = metadata;
      return {};
    },
  };
  return { service, writes };
}

describe("publishAllowAnnotations", () => {
  const code = "abc-defg-hij";

  test("merges the main room and rebuilds breakouts from the database", async () => {
    const { service, writes } = metadataService({
      [code]: JSON.stringify({ other: 1 }),
    });
    const result = await publishAllowAnnotations(
      service,
      code,
      [{ name: "Room 1", liveKitRoomName: `${code}:b1` }],
      false,
    );
    expect(result).toBe("ok");
    expect(JSON.parse(writes[code] ?? "")).toEqual({
      other: 1,
      allowAnnotations: false,
    });
    expect(JSON.parse(writes[`${code}:b1`] ?? "")).toEqual({
      breakout: "Room 1",
      main: code,
      allowAnnotations: false,
    });
  });

  test("skips rooms that don't exist yet", async () => {
    const { service } = metadataService({});
    expect(await publishAllowAnnotations(service, code, [], true)).toBe(
      "skipped",
    );
  });

  test("logs and reports transport errors without throwing", async () => {
    const log = vi.fn();
    const { service } = metadataService(
      { [code]: "" },
      { [code]: new Error("ECONNRESET") },
    );
    expect(await publishAllowAnnotations(service, code, [], true, log)).toBe(
      "failed",
    );
    expect(log).toHaveBeenCalledOnce();
  });
});

describe("isFlagOn", () => {
  test("defaults on and turns off only for explicit off values", () => {
    expect(isFlagOn(undefined)).toBe(true);
    expect(isFlagOn("1")).toBe(true);
    expect(isFlagOn("0")).toBe(false);
    expect(isFlagOn(" false ")).toBe(false);
    expect(isFlagOn("off")).toBe(false);
  });
});
