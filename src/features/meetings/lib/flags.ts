/**
 * Feature kill switches: **on** unless explicitly turned off ("0", "false",
 * "off", "no"); unset or empty means on. Pure so the parser is unit-tested;
 * `meeting-flags.ts` applies it to the client env.
 */
export function isFlagOn(value: string | undefined): boolean {
  if (value == null) return true;
  return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}

/**
 * Experimental features: **off** unless explicitly turned on ("1", "true",
 * "on", "yes"); unset or empty means off, so a missing variable in any
 * environment ships the feature off.
 */
export function isOptInFlag(value: string | undefined): boolean {
  if (value == null) return false;
  return ["1", "true", "on", "yes"].includes(value.trim().toLowerCase());
}
