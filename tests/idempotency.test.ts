import { describe, expect, it } from "vitest";

import {
  beginIdempotent,
  createMemoryIdempotencyStore,
  finishIdempotent,
  idempotencyStoreKey,
  isValidIdempotencyKey,
} from "@/integrations/api/idempotency";

describe("idempotency", () => {
  it("scopes keys per integration", () => {
    expect(idempotencyStoreKey("int-a", "k")).not.toBe(
      idempotencyStoreKey("int-b", "k"),
    );
  });

  it("accepts sane keys and refuses empty or huge ones", () => {
    expect(isValidIdempotencyKey("order-8812")).toBe(true);
    expect(isValidIdempotencyKey("")).toBe(false);
    expect(isValidIdempotencyKey("x".repeat(129))).toBe(false);
  });

  it("runs the first request, replays the second with the stored response", async () => {
    const store = createMemoryIdempotencyStore();
    const key = idempotencyStoreKey("int", "k1");

    expect(await beginIdempotent(store, key)).toEqual({ kind: "fresh" });
    await finishIdempotent(store, key, { status: 201, body: { ok: 1 } });

    expect(await beginIdempotent(store, key)).toEqual({
      kind: "replay",
      response: { status: 201, body: { ok: 1 } },
    });
  });

  it("refuses a concurrent duplicate while the first is in flight", async () => {
    const store = createMemoryIdempotencyStore();
    const key = idempotencyStoreKey("int", "k2");

    expect(await beginIdempotent(store, key)).toEqual({ kind: "fresh" });
    expect(await beginIdempotent(store, key)).toEqual({ kind: "in-progress" });
  });

  it("forgets a failed attempt so the caller can retry with a fixed body", async () => {
    const store = createMemoryIdempotencyStore();
    const key = idempotencyStoreKey("int", "k3");

    expect(await beginIdempotent(store, key)).toEqual({ kind: "fresh" });
    await finishIdempotent(store, key, { status: 400, body: { error: {} } });
    expect(await beginIdempotent(store, key)).toEqual({ kind: "fresh" });

    await finishIdempotent(store, key, null);
    expect(await beginIdempotent(store, key)).toEqual({ kind: "fresh" });
  });
});
