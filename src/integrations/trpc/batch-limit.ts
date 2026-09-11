/**
 * Cap on how many procedure calls one HTTP request may carry.
 *
 * The tRPC httpBatchLink coalesces calls made in the same tick into a single
 * request, so this has to be comfortably above what any real screen issues at
 * once — the busiest today (`/learning-flow/trainees/[id]`) is well under ten —
 * while still being a bound. Without one, a single request can ask the server
 * to run an unbounded number of queries, which is a cheap way to turn one
 * connection into a lot of database work.
 */
export const MAX_TRPC_BATCH_SIZE = 20;

/**
 * How many procedures a tRPC fetch-adapter request is asking for.
 *
 * The batch is encoded in the *path*, not the body: `/api/trpc/a,b,c` with
 * `?batch=1`. A non-batched request names exactly one procedure. Returns `null`
 * when the URL isn't a tRPC call at all, so the caller can tell "not our
 * business" from "asked for zero".
 *
 * Pure — no `Request`, no framework — so it can be tested directly.
 */
export function countBatchedProcedures(url: string): number | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const marker = "/api/trpc/";
  const markerIndex = parsed.pathname.indexOf(marker);
  if (markerIndex === -1) return null;

  const procedurePath = parsed.pathname.slice(markerIndex + marker.length);
  if (!procedurePath) return 0;

  // Empty segments count: `a,,b` is a malformed batch of three, and treating
  // it as two would let the count be understated by padding with commas.
  return procedurePath.split(",").length;
}

/** True when the request asks for more procedures than the cap allows. */
export function exceedsBatchLimit(url: string): boolean {
  const count = countBatchedProcedures(url);
  return count !== null && count > MAX_TRPC_BATCH_SIZE;
}
