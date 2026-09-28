import { describe, expect, test, vi } from "vitest";

import { handleMediaShortcut } from "@/features/meetings/components/room/media-shortcuts";
import {
  applyBadge,
  stripBadge,
} from "@/features/meetings/components/room/title-badge";
import {
  WaitingDispatcher,
  waitingErrorKey,
} from "@/features/meetings/components/room/waiting-dispatcher";

function key(
  value: string,
  overrides: Partial<{
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    repeat: boolean;
    target: unknown;
  }> = {},
) {
  return {
    key: value,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    repeat: false,
    target: null,
    ...overrides,
  } as unknown as KeyboardEvent;
}

function toggles() {
  return { mic: { toggle: vi.fn() }, camera: { toggle: vi.fn() } };
}

describe("handleMediaShortcut", () => {
  test("m toggles the mic, v the camera, in either case", () => {
    const t = toggles();
    expect(handleMediaShortcut(key("m"), t)).toBe(true);
    expect(handleMediaShortcut(key("V"), t)).toBe(true);
    expect(t.mic.toggle).toHaveBeenCalledTimes(1);
    expect(t.camera.toggle).toHaveBeenCalledTimes(1);
  });

  test("ignores modifiers, held keys and typing", () => {
    const t = toggles();
    const input = { closest: () => ({}) };
    expect(handleMediaShortcut(key("m", { ctrlKey: true }), t)).toBe(false);
    expect(handleMediaShortcut(key("m", { metaKey: true }), t)).toBe(false);
    expect(handleMediaShortcut(key("m", { altKey: true }), t)).toBe(false);
    expect(handleMediaShortcut(key("m", { repeat: true }), t)).toBe(false);
    expect(handleMediaShortcut(key("m", { target: input }), t)).toBe(false);
    expect(t.mic.toggle).not.toHaveBeenCalled();
  });

  test("other keys are left to the caller", () => {
    expect(handleMediaShortcut(key("h"), toggles())).toBe(false);
  });
});

describe("tab title badge", () => {
  test("round-trips en and ar titles", () => {
    for (const title of ["Weekly sync", "اجتماع أسبوعي"]) {
      expect(stripBadge(applyBadge(title, "(2)"))).toBe(title);
    }
  });

  test("never doubles the badge", () => {
    const twice = applyBadge(applyBadge("Sync", "(2)"), "(3)");
    expect(twice).toBe("⁨(3)⁩ Sync");
  });

  test("null removes it; a new base title keeps one badge", () => {
    expect(applyBadge(applyBadge("Sync", "(1)"), null)).toBe("Sync");
    // Another writer replaced the title while the badge was shown.
    expect(applyBadge("New title", "(1)")).toBe("⁨(1)⁩ New title");
  });
});

describe("waitingErrorKey", () => {
  test("maps tRPC codes and network failures", () => {
    expect(waitingErrorKey({ data: { code: "NOT_FOUND" } }, true)).toBeNull();
    expect(waitingErrorKey({ data: { code: "FORBIDDEN" } }, true)).toBe(
      "meetings.waiting.notHost",
    );
    expect(
      waitingErrorKey({ data: { code: "INTERNAL_SERVER_ERROR" } }, true),
    ).toBe("meetings.waiting.actionFailed");
    expect(waitingErrorKey(new TypeError("Failed to fetch"), true)).toBe(
      "meetings.waiting.offline",
    );
    expect(waitingErrorKey(new Error("boom"), false)).toBe(
      "meetings.waiting.offline",
    );
    expect(waitingErrorKey(new Error("boom"), true)).toBe(
      "meetings.waiting.actionFailed",
    );
  });
});

function dispatcher() {
  const changes: unknown[] = [];
  const toastErrors: string[] = [];
  const afterRun = vi.fn();
  const d = new WaitingDispatcher({
    onChange: (state) => changes.push(state),
    onToastError: (key) => toastErrors.push(key),
    beforeRun: async () => {},
    afterRun,
    isOnline: () => true,
  });
  return { d, changes, toastErrors, afterRun };
}

const list = [
  { id: "a", displayName: "Ann" },
  { id: "b", displayName: "Bob" },
];

describe("WaitingDispatcher", () => {
  test("ignores a second action while one is in flight", async () => {
    const { d } = dispatcher();
    let resolve = () => {};
    const first = d.run(
      { kind: "one", id: "a" },
      () => new Promise<void>((done) => (resolve = done)),
    );
    const call = vi.fn(async () => {});
    expect(await d.run({ kind: "one", id: "b" }, call)).toBe("ignored");
    expect(call).not.toHaveBeenCalled();
    resolve();
    expect(await first).toBe("done");
    expect(d.isBusy).toBe(false);
  });

  test("a stale poll cannot bring an admitted row back", async () => {
    const { d, afterRun } = dispatcher();
    await d.run({ kind: "one", id: "a" }, async () => {});
    // The poll that was in flight still lists "a".
    expect(d.visible(list).map((r) => r.id)).toEqual(["b"]);
    expect(afterRun).toHaveBeenCalledTimes(1);
  });

  test("a failure brings the row back with an inline error", async () => {
    const { d, changes } = dispatcher();
    await d.run({ kind: "one", id: "a" }, async () => {
      throw { data: { code: "INTERNAL_SERVER_ERROR" } };
    });
    expect(d.visible(list)).toHaveLength(2);
    expect(changes.at(-1)).toEqual({
      pending: null,
      error: "meetings.waiting.actionFailed",
    });
  });

  test("NOT_FOUND (already resolved elsewhere) stays resolved, silently", async () => {
    const { d, changes, toastErrors } = dispatcher();
    await d.run({ kind: "one", id: "a" }, async () => {
      throw { data: { code: "NOT_FOUND" } };
    });
    expect(d.visible(list).map((r) => r.id)).toEqual(["b"]);
    expect(changes.at(-1)).toEqual({ pending: null, error: null });
    expect(toastErrors).toEqual([]);
  });

  test("a toast-started failure is a toast, not an inline error", async () => {
    const { d, changes, toastErrors } = dispatcher();
    await d.run(
      { kind: "one", id: "a" },
      async () => {
        throw { data: { code: "FORBIDDEN" } };
      },
      "toast",
    );
    expect(toastErrors).toEqual(["meetings.waiting.notHost"]);
    expect(changes.at(-1)).toEqual({ pending: null, error: null });
  });

  test("admit all hides every row and reports pending as all", async () => {
    const { d, changes } = dispatcher();
    await d.run({ kind: "all", ids: ["a", "b"] }, async () => {});
    expect(changes[0]).toEqual({ pending: { kind: "all" }, error: null });
    expect(d.visible(list)).toEqual([]);
  });
});
