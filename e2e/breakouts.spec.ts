import { expect, test } from "./fixtures";
import { expectInRoom, joinRoom, signIn, submitPreJoin } from "./helpers";

/**
 * Breakouts are LiveKit server-side moves: the host creates two rooms,
 * shuffles the guests in, opens — each guest's *live connection* lands in
 * a breakout (banner appears, the other guest disappears from their grid),
 * a broadcast reaches them there, one guest returns by themself, and
 * "Close all" brings everyone home.
 */
test("breakout rooms move guests server-side and back", async ({ newPage }) => {
  const host = await newPage();
  await signIn(host);
  await host.goto("/dashboard");
  await host.getByRole("button", { name: /new meeting/i }).click();
  await host.waitForURL(/\/m\//);
  const url = host.url();
  await joinRoom(host, "Test Host");

  // Turn the waiting room off so guests walk straight in.
  await host.getByRole("button", { name: /^settings$/i }).click();
  await host.getByRole("switch", { name: /waiting room/i }).click();
  await host.keyboard.press("Escape");

  const alice = await newPage();
  await alice.goto(url);
  await joinRoom(alice, "Alice");
  const bob = await newPage();
  await bob.goto(url);
  await joinRoom(bob, "Bob");
  await expect(host.getByText(/3 participants/)).toBeVisible({
    timeout: 15_000,
  });

  // Create two rooms, shuffle, open.
  await host.getByRole("button", { name: /breakout rooms/i }).click();
  await host.getByLabel(/how many rooms/i).fill("2");
  await host.getByRole("button", { name: /create rooms/i }).click();
  await expect(host.getByText("Room 1")).toBeVisible();
  await expect(host.getByText("Room 2")).toBeVisible();
  await host.getByRole("button", { name: /shuffle everyone/i }).click();
  await expect(host.getByText("Alice", { exact: true }).first()).toBeVisible();
  await host.getByRole("button", { name: /^open rooms$/i }).click();

  // Each guest lands in a breakout: banner up, alone with their room-mates.
  await expect(alice.getByText(/you're in room \d/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(bob.getByText(/you're in room \d/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(alice.getByText(/1 participant$/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(host.getByText(/1 participant$/)).toBeVisible({
    timeout: 15_000,
  });

  // Broadcast reaches the breakout rooms.
  await host
    .getByPlaceholder(/message everyone in every room/i)
    .fill("five minutes left");
  await host.getByRole("button", { name: /send to all rooms/i }).click();
  await expect(alice.getByText("five minutes left")).toBeVisible({
    timeout: 10_000,
  });

  // Alice returns on her own (guest, proves identity with the participant key).
  await alice.getByRole("button", { name: /return to main room/i }).click();
  await expect(alice.getByText(/you're in room/i)).toBeHidden({
    timeout: 15_000,
  });
  await expect(host.getByText(/2 participants/)).toBeVisible({
    timeout: 15_000,
  });

  // Host drops into Bob's room and back.
  await host
    .getByRole("button", { name: /^join$/i })
    .first()
    .click();
  await expect(host.getByText(/you're in room \d/i)).toBeVisible({
    timeout: 15_000,
  });
  await host.getByRole("button", { name: /return to main room/i }).click();
  await expect(host.getByText(/you're in room/i)).toBeHidden({
    timeout: 15_000,
  });

  // Close all: Bob comes home.
  await host.getByRole("button", { name: /close all rooms/i }).click();
  await expect(bob.getByText(/you're in room/i)).toBeHidden({
    timeout: 15_000,
  });
  await expect(host.getByText(/3 participants/)).toBeVisible({
    timeout: 15_000,
  });

  // A late joiner is unaffected by the closed rooms.
  const late = await newPage();
  await late.goto(url);
  await submitPreJoin(late, "Late");
  await expectInRoom(late);
});
