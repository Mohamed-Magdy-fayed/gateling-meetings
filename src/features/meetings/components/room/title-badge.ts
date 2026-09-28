/**
 * The opener tab's knock badge: "(2) Weekly sync". The badge is wrapped in
 * Unicode bidi isolates (FSI … PDI), which keep it at the start of an
 * Arabic title and double as the marker `stripBadge` looks for — so the
 * badge is always rebuilt from the current base title, never doubled, and
 * other title writers (Next.js metadata) are never overwritten.
 */
const OPEN = "⁨";
const CLOSE = "⁩";
const BADGE = new RegExp(`^${OPEN}[^${CLOSE}]*${CLOSE} `);

export function stripBadge(title: string): string {
  return title.replace(BADGE, "");
}

/** `badge` is the translated "(n)"; empty or null removes the badge. */
export function applyBadge(title: string, badge: string | null): string {
  const base = stripBadge(title);
  return badge ? `${OPEN}${badge}${CLOSE} ${base}` : base;
}
