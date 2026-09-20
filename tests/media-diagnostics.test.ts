import { afterEach, describe, expect, test, vi } from "vitest";

import {
  deviceLabel,
  resolveDeviceId,
} from "@/features/meetings/lib/media/device-store";
import {
  createExternalStore,
  shallowEqual,
} from "@/features/meetings/lib/media/external-store";
import {
  classifyMediaError,
  detectBrowserFamily,
  isMediaError,
} from "@/features/meetings/lib/media/media-failure";
import {
  permissionStore,
  resetPermissionStoresForTests,
} from "@/features/meetings/lib/media/permission-store";
import {
  INITIAL_MEMORY,
  nextHealth,
} from "@/features/meetings/lib/media/track-health-store";

function domError(name: string, message = "") {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe("classifyMediaError", () => {
  test("maps the browser's permission errors to denied", () => {
    expect(classifyMediaError(domError("NotAllowedError"))).toBe("denied");
    expect(classifyMediaError(domError("PermissionDeniedError"))).toBe(
      "denied",
    );
    expect(classifyMediaError(domError("SecurityError"))).toBe("denied");
  });

  test("distinguishes a missing device from one another app holds", () => {
    expect(classifyMediaError(domError("NotFoundError"))).toBe("notFound");
    expect(classifyMediaError(domError("NotReadableError"))).toBe("inUse");
    expect(classifyMediaError(domError("TrackStartError"))).toBe("inUse");
    expect(classifyMediaError(domError("OverconstrainedError"))).toBe(
      "constraints",
    );
  });

  test("falls back to the message, then to other", () => {
    expect(classifyMediaError(new Error("Permission denied by system"))).toBe(
      "denied",
    );
    expect(classifyMediaError(new Error("boom"))).toBe("other");
    expect(classifyMediaError(undefined)).toBe("other");
  });

  test("isMediaError ignores connection errors", () => {
    expect(isMediaError(domError("NotAllowedError"))).toBe(true);
    expect(isMediaError(domError("ConnectionError"))).toBe(false);
    expect(isMediaError("nope")).toBe(false);
  });
});

describe("detectBrowserFamily", () => {
  test("tells Chromium, Firefox and Safari apart", () => {
    expect(
      detectBrowserFamily(
        "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Edg/128.0",
      ),
    ).toBe("chromium");
    expect(
      detectBrowserFamily(
        "Mozilla/5.0 (X11; Linux) Gecko/20100101 Firefox/130.0",
      ),
    ).toBe("firefox");
    expect(
      detectBrowserFamily(
        "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      ),
    ).toBe("safari");
    expect(detectBrowserFamily("curl/8")).toBe("other");
  });
});

describe("resolveDeviceId", () => {
  const devices = [
    { deviceId: "default", kind: "audioinput", label: "Default", groupId: "" },
    { deviceId: "mic-2", kind: "audioinput", label: "Headset", groupId: "" },
    { deviceId: "cam-1", kind: "videoinput", label: "Webcam", groupId: "" },
  ] as MediaDeviceInfo[];

  test("keeps an id that still exists", () => {
    expect(resolveDeviceId("mic-2", devices, "audioinput")).toBe("mic-2");
  });

  test("falls back to the default device when the saved one is gone", () => {
    expect(resolveDeviceId("old-headset", devices, "audioinput")).toBe(
      "default",
    );
    expect(resolveDeviceId("old-cam", devices, "videoinput")).toBe("cam-1");
  });

  test("leaves browser-default alone and trusts the id before the list loads", () => {
    expect(resolveDeviceId("", devices, "audioinput")).toBe("");
    expect(resolveDeviceId("mic-x", [], "audioinput")).toBe("mic-x");
  });

  test("deviceLabel numbers unlabeled devices", () => {
    const unlabeled = devices.map((device) => ({ ...device, label: "" }));
    expect(deviceLabel("mic-2", unlabeled, "audioinput", "Microphone")).toBe(
      "Microphone 2",
    );
    expect(deviceLabel("mic-2", devices, "audioinput", "Microphone")).toBe(
      "Headset",
    );
    expect(deviceLabel("nope", devices, "audioinput", "Microphone")).toBe(
      "Microphone",
    );
  });
});

describe("nextHealth", () => {
  const open = { isHardwareMuted: false, isAppMuted: false, isEnded: false };

  test("reports live as soon as there is any signal", () => {
    const { health } = nextHealth({ ...open, volume: 0.25 }, INITIAL_MEMORY, 0);
    expect(health.status).toBe("live");
    // sqrt(0.25) — the meter is perceptual, not linear.
    expect(health.level).toBe(0.5);
  });

  test("calls a flat track silent only after the grace period", () => {
    let memory = INITIAL_MEMORY;
    let result = nextHealth({ ...open, volume: 0 }, memory, 1000);
    expect(result.health.status).toBe("unknown");
    memory = result.memory;
    result = nextHealth({ ...open, volume: 0 }, memory, 4500);
    expect(result.health.status).toBe("unknown");
    memory = result.memory;
    result = nextHealth({ ...open, volume: 0 }, memory, 5000);
    expect(result.health.status).toBe("silent");
    // A single sample of sound clears it.
    result = nextHealth({ ...open, volume: 0.2 }, result.memory, 5100);
    expect(result.health.status).toBe("live");
  });

  test("hardware mute and ended win over the level", () => {
    expect(
      nextHealth(
        { ...open, volume: 0.5, isHardwareMuted: true },
        INITIAL_MEMORY,
        0,
      ).health.status,
    ).toBe("hardwareMuted");
    expect(
      nextHealth({ ...open, volume: 0.5, isEnded: true }, INITIAL_MEMORY, 0)
        .health.status,
    ).toBe("ended");
  });

  test("flags talking while app-muted after sustained speech", () => {
    const muted = { ...open, isAppMuted: true, volume: 0.4 };
    let result = nextHealth(muted, INITIAL_MEMORY, 0);
    expect(result.health.isSpeakingWhileMuted).toBe(false);
    result = nextHealth(muted, result.memory, 1600);
    expect(result.health.isSpeakingWhileMuted).toBe(true);
    result = nextHealth({ ...muted, volume: 0.01 }, result.memory, 1700);
    expect(result.health.isSpeakingWhileMuted).toBe(false);
  });
});

describe("createExternalStore", () => {
  test("starts on first subscriber, stops on last, keeps the snapshot", () => {
    const stop = vi.fn();
    const start = vi.fn(() => stop);
    const store = createExternalStore({ initial: 0, start });
    const listener = vi.fn();

    const unsubscribeA = store.subscribe(listener);
    const unsubscribeB = store.subscribe(() => {});
    expect(start).toHaveBeenCalledTimes(1);

    store.set(1);
    store.set(1); // equal → no notification
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(1);

    unsubscribeA();
    expect(stop).not.toHaveBeenCalled();
    unsubscribeB();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(1);
  });

  test("shallowEqual keeps the same reference for equal records", () => {
    const store = createExternalStore({
      initial: { a: 1, b: "x" },
      isEqual: shallowEqual,
    });
    const before = store.getSnapshot();
    store.set({ a: 1, b: "x" });
    expect(store.getSnapshot()).toBe(before);
    store.set({ a: 2, b: "x" });
    expect(store.getSnapshot()).not.toBe(before);
  });
});

describe("permissionStore", () => {
  afterEach(() => {
    resetPermissionStoresForTests();
    vi.unstubAllGlobals();
  });

  test("reflects the browser's answer and follows change events", async () => {
    const listeners = new Set<() => void>();
    const status = {
      state: "prompt",
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    };
    vi.stubGlobal("navigator", {
      permissions: { query: vi.fn().mockResolvedValue(status) },
    });

    const store = permissionStore("microphone");
    const notify = vi.fn();
    const unsubscribe = store.subscribe(notify);
    expect(store.getSnapshot()).toBe("unknown");
    await Promise.resolve();
    expect(store.getSnapshot()).toBe("prompt");

    status.state = "granted";
    for (const fn of listeners) fn();
    expect(store.getSnapshot()).toBe("granted");

    unsubscribe();
    expect(listeners.size).toBe(0);
  });

  test("reports unsupported when the browser rejects the query", async () => {
    vi.stubGlobal("navigator", {
      permissions: { query: vi.fn().mockRejectedValue(new TypeError("nope")) },
    });
    const store = permissionStore("camera");
    store.subscribe(() => {});
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getSnapshot()).toBe("unsupported");
  });

  test("reports unsupported without a Permissions API at all", () => {
    vi.stubGlobal("navigator", {});
    const store = permissionStore("camera");
    store.subscribe(() => {});
    expect(store.getSnapshot()).toBe("unsupported");
  });
});
