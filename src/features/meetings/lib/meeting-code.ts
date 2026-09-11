/**
 * Meeting codes look like Google Meet's: `abc-defg-hij`. Ten lowercase
 * letters from a 21-letter alphabet (no vowels, so a code is never a word) is
 * 21^10 ≈ 1.7e13 combinations — unguessable in practice, and the join
 * endpoint is rate-limited besides.
 */
const ALPHABET = "bcdfghjkmnpqrstvwxyz";
const GROUPS = [3, 4, 3] as const;

export const MEETING_CODE_PATTERN = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

function randomLetters(length: number, random: (max: number) => number) {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[random(ALPHABET.length)];
  return out;
}

/** Uniform in `[0, max)` from `crypto.getRandomValues` — not `Math.random`. */
function cryptoRandom(max: number): number {
  const buffer = new Uint32Array(1);
  // Rejection sampling: discard values that would bias the modulo.
  const limit = Math.floor(0x100000000 / max) * max;
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0] as number;
  } while (value >= limit);
  return value % max;
}

export function generateMeetingCode(
  random: (max: number) => number = cryptoRandom,
): string {
  return GROUPS.map((length) => randomLetters(length, random)).join("-");
}

/**
 * Accepts whatever a person is likely to paste — the bare code, the code
 * with spaces or without dashes, or the whole meeting URL — and returns the
 * canonical `abc-defg-hij` form, or `null` if nothing code-shaped is there.
 */
export function normalizeMeetingCode(input: string): string | null {
  let value = input.trim().toLowerCase();

  // A full URL: the code is a path segment, never the host name.
  if (value.includes("://")) {
    try {
      value = new URL(value).pathname;
    } catch {
      return null;
    }
  }

  // A path (`/m/abc-defg-hij`): keep only the last segment.
  if (value.includes("/")) {
    const withoutQuery = value.split(/[?#]/)[0] ?? "";
    const segments = withoutQuery.split("/").filter(Boolean);
    value = segments[segments.length - 1] ?? "";
  }

  const letters = value.replace(/[^a-z]/g, "");
  if (letters.length !== 10) return null;

  const formatted = `${letters.slice(0, 3)}-${letters.slice(3, 7)}-${letters.slice(7)}`;
  return MEETING_CODE_PATTERN.test(formatted) ? formatted : null;
}
