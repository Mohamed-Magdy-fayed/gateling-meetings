import { describe, expect, it } from "vitest";

import {
  clientIpFromHeaders,
  createPaddleIpAllowlist,
  ipMatchesCidrs,
  parseIpsResponse,
} from "@/integrations/paddle/ips";

const HOUR = 60 * 60 * 1000;

describe("parseIpsResponse", () => {
  it("returns data.ipv4_cidrs", () => {
    expect(
      parseIpsResponse({ data: { ipv4_cidrs: ["1.2.3.4/32", "5.6.7.8/32"] } }),
    ).toEqual(["1.2.3.4/32", "5.6.7.8/32"]);
  });

  it("rejects an empty or malformed body", () => {
    expect(() => parseIpsResponse({ data: { ipv4_cidrs: [] } })).toThrow();
    expect(() => parseIpsResponse({ data: {} })).toThrow();
    expect(() => parseIpsResponse(null)).toThrow();
    expect(() => parseIpsResponse({ data: { ipv4_cidrs: [1] } })).toThrow();
  });
});

describe("ipMatchesCidrs", () => {
  const cidrs = ["34.194.127.46/32", "10.0.0.0/8"];

  it("matches /32 exactly and wider ranges by prefix", () => {
    expect(ipMatchesCidrs("34.194.127.46", cidrs)).toBe(true);
    expect(ipMatchesCidrs("34.194.127.47", cidrs)).toBe(false);
    expect(ipMatchesCidrs("10.255.1.2", cidrs)).toBe(true);
    expect(ipMatchesCidrs("11.0.0.1", cidrs)).toBe(false);
  });

  it("accepts a bare address as /32 and IPv4-mapped IPv6", () => {
    expect(ipMatchesCidrs("34.194.127.46", ["34.194.127.46"])).toBe(true);
    expect(ipMatchesCidrs("::ffff:34.194.127.46", cidrs)).toBe(true);
  });

  it("never matches garbage", () => {
    expect(ipMatchesCidrs("not-an-ip", cidrs)).toBe(false);
    expect(ipMatchesCidrs("2001:db8::1", cidrs)).toBe(false);
    expect(ipMatchesCidrs("1.2.3.4", ["1.2.3.4/40"])).toBe(false);
    expect(ipMatchesCidrs("1.2.3.4", ["1.2.3/32"])).toBe(false);
  });
});

describe("clientIpFromHeaders", () => {
  it("prefers the first x-forwarded-for entry, then x-real-ip", () => {
    expect(
      clientIpFromHeaders(
        new Headers({
          "x-forwarded-for": " 1.1.1.1, 2.2.2.2",
          "x-real-ip": "3.3.3.3",
        }),
      ),
    ).toBe("1.1.1.1");
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "3.3.3.3" }))).toBe(
      "3.3.3.3",
    );
    expect(clientIpFromHeaders(new Headers())).toBeNull();
  });
});

function fakeFetch(
  responses: Array<{ ok: boolean; status?: number; body?: unknown } | Error>,
) {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    calls.push(String(input));
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return {
      ok: next.ok,
      status: next.status ?? (next.ok ? 200 : 500),
      json: async () => next.body,
    } as Response;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const paddleList = { data: { ipv4_cidrs: ["34.194.127.46/32"] } };

describe("createPaddleIpAllowlist", () => {
  it("fetches once and serves from cache inside the TTL", async () => {
    let clock = 0;
    const { fetchImpl, calls } = fakeFetch([{ ok: true, body: paddleList }]);
    const list = createPaddleIpAllowlist({
      url: "https://api.paddle.com/ips",
      fetchImpl,
      now: () => clock,
    });

    expect(await list.check("34.194.127.46")).toBe("allowed");
    expect(await list.check("34.194.127.46")).toBe("allowed");
    clock = HOUR - 1;
    expect(await list.check("8.8.8.8")).toBe("denied");
    expect(calls).toEqual(["https://api.paddle.com/ips"]);
  });

  it("refreshes after the TTL and picks up a changed list", async () => {
    let clock = 0;
    const { fetchImpl, calls } = fakeFetch([
      { ok: true, body: paddleList },
      { ok: true, body: { data: { ipv4_cidrs: ["9.9.9.9/32"] } } },
    ]);
    const list = createPaddleIpAllowlist({
      url: "u",
      fetchImpl,
      now: () => clock,
    });

    expect(await list.check("34.194.127.46")).toBe("allowed");
    clock = HOUR + 1;
    expect(await list.check("34.194.127.46")).toBe("denied");
    expect(await list.check("9.9.9.9")).toBe("allowed");
    expect(calls).toHaveLength(2);
  });

  it("serves a stale list while Paddle is unreachable, then gives up", async () => {
    let clock = 0;
    const { fetchImpl } = fakeFetch([
      { ok: true, body: paddleList },
      new Error("network"),
      { ok: false, status: 502 },
    ]);
    const list = createPaddleIpAllowlist({
      url: "u",
      fetchImpl,
      now: () => clock,
    });

    expect(await list.check("34.194.127.46")).toBe("allowed");
    clock = 2 * HOUR;
    expect(await list.check("34.194.127.46")).toBe("allowed");
    clock = 25 * HOUR;
    expect(await list.check("34.194.127.46")).toBe("unknown");
  });

  it("is unknown when the list was never fetched", async () => {
    const { fetchImpl } = fakeFetch([new Error("down")]);
    const list = createPaddleIpAllowlist({ url: "u", fetchImpl });
    expect(await list.check("34.194.127.46")).toBe("unknown");
  });

  it("denies a missing address without fetching", async () => {
    const { fetchImpl, calls } = fakeFetch([]);
    const list = createPaddleIpAllowlist({ url: "u", fetchImpl });
    expect(await list.check(null)).toBe("denied");
    expect(calls).toHaveLength(0);
  });

  it("coalesces concurrent refreshes into one request", async () => {
    const { fetchImpl, calls } = fakeFetch([{ ok: true, body: paddleList }]);
    const list = createPaddleIpAllowlist({ url: "u", fetchImpl });
    const verdicts = await Promise.all([
      list.check("34.194.127.46"),
      list.check("34.194.127.46"),
      list.check("1.1.1.1"),
    ]);
    expect(verdicts).toEqual(["allowed", "allowed", "denied"]);
    expect(calls).toHaveLength(1);
  });
});
