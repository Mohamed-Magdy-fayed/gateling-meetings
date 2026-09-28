const last = new Map<string, number>();

/**
 * Dev-only breadcrumbs for the floating window's quiet fallbacks (chime
 * skipped, permission API missing, …): one `console.debug` per event per
 * 5 seconds, nothing in production.
 */
export function pipDiag(event: string, detail?: string) {
  if (process.env.NODE_ENV === "production") return;
  const now = Date.now();
  if (now - (last.get(event) ?? 0) < 5_000) return;
  last.set(event, now);
  console.debug(`[pip] ${event}${detail ? `: ${detail}` : ""}`);
}
