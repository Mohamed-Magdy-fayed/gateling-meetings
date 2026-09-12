import "server-only";

import { redisClient } from "@/integrations/redis";
import type { IdempotencyStore, StoredResponse } from "./idempotency";

const IN_PROGRESS = "__in_progress__";

/** Upstash-backed store; `SET NX` makes the claim atomic across instances. */
export const redisIdempotencyStore: IdempotencyStore = {
  async get(key) {
    const value = await redisClient.get<StoredResponse | string>(key);
    if (value == null) return null;
    if (value === IN_PROGRESS) return "in-progress";
    return typeof value === "string" ? null : value;
  },
  async claim(key, ttlSeconds) {
    const result = await redisClient.set(key, IN_PROGRESS, {
      nx: true,
      ex: ttlSeconds,
    });
    return result === "OK";
  },
  async put(key, value, ttlSeconds) {
    await redisClient.set(key, value, { ex: ttlSeconds });
  },
  async release(key) {
    await redisClient.del(key);
  },
};
