/**
 * Feature kill switches: on unless explicitly turned off. Pure so the
 * parser is unit-tested; `meeting-flags.ts` applies it to the client env.
 */
export function isFlagOn(value: string | undefined): boolean {
  if (value == null) return true;
  return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}
