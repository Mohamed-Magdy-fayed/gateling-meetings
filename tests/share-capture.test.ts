import { afterEach, describe, expect, test, vi } from "vitest";

import {
  canControlSurface,
  clearShareCapture,
  newShareCaptureOptions,
  type ShareCaptureController,
} from "@/features/meetings/components/room/share-capture";

class FakeController extends EventTarget {
  forwardWheel = vi.fn(async () => {});
  getSupportedZoomLevels = vi.fn(() => [50, 100, 200]);
  setZoomLevel = vi.fn(async () => {});
  zoomLevel = 100;
}

function videoSharing(displaySurface: string | undefined) {
  return {
    srcObject: {
      getVideoTracks: () => [{ getSettings: () => ({ displaySurface }) }],
    },
  } as unknown as HTMLVideoElement;
}

afterEach(() => {
  clearShareCapture();
  vi.unstubAllGlobals();
});

describe("newShareCaptureOptions (Meet-style picker)", () => {
  test("offers tabs first, hides the meeting tab, allows switching tabs", () => {
    vi.stubGlobal("window", {});
    const options = newShareCaptureOptions();
    expect(options).toMatchObject({
      audio: true,
      video: { displaySurface: "browser" },
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
      systemAudio: "include",
    });
    expect(options.controller).toBeUndefined();
  });

  test("hands a fresh capture controller to every share", () => {
    vi.stubGlobal("window", { CaptureController: FakeController });
    const first = newShareCaptureOptions().controller;
    const second = newShareCaptureOptions().controller;
    expect(first).toBeInstanceOf(FakeController);
    expect(second).toBeInstanceOf(FakeController);
    expect(first).not.toBe(second);
  });
});

describe("canControlSurface (Captured Surface Control)", () => {
  const controller = new FakeController() as ShareCaptureController;

  test("only a tab share can be scrolled and zoomed", () => {
    expect(canControlSurface(controller, videoSharing("browser"))).toBe(true);
    expect(canControlSurface(controller, videoSharing("monitor"))).toBe(false);
    expect(canControlSurface(controller, videoSharing("window"))).toBe(false);
  });

  test("needs a controller that supports it and a playing share", () => {
    expect(canControlSurface(null, videoSharing("browser"))).toBe(false);
    const older = new EventTarget() as ShareCaptureController;
    expect(canControlSurface(older, videoSharing("browser"))).toBe(false);
    expect(canControlSurface(controller, null)).toBe(false);
    const paused = { srcObject: null } as unknown as HTMLVideoElement;
    expect(canControlSurface(controller, paused)).toBe(false);
  });
});
