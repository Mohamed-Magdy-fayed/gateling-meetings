/**
 * LiveKit identities must be unique per room; a second connection with the
 * same identity bumps the first. Hosts are stable (`user:<id>`) so a host
 * who reopens the tab replaces their stale session rather than appearing
 * twice. Import-safe on server and browser.
 */
export function userIdentity(userId: string) {
  return `user:${userId}`;
}
