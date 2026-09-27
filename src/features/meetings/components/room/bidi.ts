/**
 * Wraps a user-provided string (a participant's name) in Unicode first-
 * strong isolates — the plain-text equivalent of `<bdi>` — so a Latin name
 * inside an Arabic sentence, or the reverse, can't reorder the words
 * around it. Use it for values interpolated into translated sentences.
 */
export function isolate(text: string): string {
  return `⁨${text}⁩`;
}
