/**
 * `Idempotency-Key` support for `POST /api/v1/meetings`: the same key from
 * the same integration within 24 hours replays the first response instead
 * of creating a second meeting. The store is an interface so the logic is
 * unit-tested with a Map; production plugs in Upstash.
 */
export type StoredResponse = { status: number; body: unknown };

export type IdempotencyStore = {
  get(key: string): Promise<StoredResponse | "in-progress" | null>;
  /** Claims the key; false when someone else already did. */
  claim(key: string, ttlSeconds: number): Promise<boolean>;
  put(key: string, value: StoredResponse, ttlSeconds: number): Promise<void>;
  release(key: string): Promise<void>;
};

export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
export const IDEMPOTENCY_HEADER = "idempotency-key";
export const REPLAYED_HEADER = "idempotent-replayed";
const MAX_KEY_LENGTH = 128;

export type IdempotencyOutcome =
  | { kind: "fresh" }
  | { kind: "replay"; response: StoredResponse }
  | { kind: "in-progress" };

export function idempotencyStoreKey(integrationId: string, key: string) {
  return `idempotency:${integrationId}:${key}`;
}

export function isValidIdempotencyKey(key: string): boolean {
  return key.length > 0 && key.length <= MAX_KEY_LENGTH;
}

/** Decide whether to run the handler, replay, or refuse a concurrent duplicate. */
export async function beginIdempotent(
  store: IdempotencyStore,
  storeKey: string,
): Promise<IdempotencyOutcome> {
  const existing = await store.get(storeKey);
  if (existing === "in-progress") return { kind: "in-progress" };
  if (existing) return { kind: "replay", response: existing };
  const claimed = await store.claim(storeKey, IDEMPOTENCY_TTL_SECONDS);
  if (!claimed) {
    // Lost the race: whoever won is either still running or already stored.
    const winner = await store.get(storeKey);
    if (winner && winner !== "in-progress") {
      return { kind: "replay", response: winner };
    }
    return { kind: "in-progress" };
  }
  return { kind: "fresh" };
}

/**
 * Only successful outcomes are remembered: a validation error should not
 * pin the key to a failure the caller then fixes and retries.
 */
export async function finishIdempotent(
  store: IdempotencyStore,
  storeKey: string,
  response: StoredResponse | null,
) {
  if (response && response.status < 400) {
    await store.put(storeKey, response, IDEMPOTENCY_TTL_SECONDS);
  } else {
    await store.release(storeKey);
  }
}

export function createMemoryIdempotencyStore(): IdempotencyStore {
  const map = new Map<string, StoredResponse | "in-progress">();
  return {
    async get(key) {
      return map.get(key) ?? null;
    },
    async claim(key) {
      if (map.has(key)) return false;
      map.set(key, "in-progress");
      return true;
    },
    async put(key, value) {
      map.set(key, value);
    },
    async release(key) {
      if (map.get(key) === "in-progress") map.delete(key);
    },
  };
}
