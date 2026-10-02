import { beforeEach, describe, expect, it, vi } from "vitest";

const sent: { toEmail: string; subject: string; text?: string }[] = [];
const claimed = new Set<string>();

vi.mock("@/data/env/server", () => ({
  adminEmails: new Set(["ops@example.test"]),
}));
vi.mock("@/integrations/email", () => ({
  isMailConfigured: () => true,
  sendMail: vi.fn(async (mail: (typeof sent)[number]) => {
    sent.push(mail);
  }),
}));
vi.mock("@/integrations/redis", () => ({
  redisClient: {
    // SET NX: "OK" the first time a key is claimed, null after.
    set: vi.fn(async (key: string) => {
      if (claimed.has(key)) return null;
      claimed.add(key);
      return "OK";
    }),
  },
}));

const { sendBillingAlert } = await import("@/features/billing/server/alerts");

describe("billing alerts", () => {
  beforeEach(() => {
    sent.length = 0;
    claimed.clear();
  });

  it("emails the admins with the reason and ids", async () => {
    await sendBillingAlert({
      kind: "event_failed",
      throttleKey: "evt-1",
      details: { "Billing event": "evt-1", Error: "amount mismatch" },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.toEmail).toBe("ops@example.test");
    expect(sent[0]?.subject).toContain("failed to process");
    expect(sent[0]?.text).toContain("Billing event: evt-1");
    expect(sent[0]?.text).toContain("Error: amount mismatch");
  });

  it("sends one rejection alert per hour, however many callbacks fail", async () => {
    for (let i = 0; i < 5; i++) {
      await sendBillingAlert({
        kind: "webhook_rejected",
        details: { Reason: "transaction HMAC mismatch" },
      });
    }
    expect(sent).toHaveLength(1);
  });

  it("alerts once per failed event, not once per kind", async () => {
    await sendBillingAlert({
      kind: "event_failed",
      throttleKey: "a",
      details: {},
    });
    await sendBillingAlert({
      kind: "event_failed",
      throttleKey: "b",
      details: {},
    });
    await sendBillingAlert({
      kind: "event_failed",
      throttleKey: "a",
      details: {},
    });
    expect(sent).toHaveLength(2);
  });
});
