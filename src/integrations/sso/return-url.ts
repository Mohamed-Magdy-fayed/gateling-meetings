/**
 * A `returnUrl` must sit on one of the origins the admin listed for the
 * integration — the only place the app ever links *out* to, so it is not
 * an open redirect. Pure, so it is unit-tested directly.
 */
export function isAllowedReturnUrl(
  returnUrl: string,
  allowedOrigins: readonly string[],
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(returnUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return false;
  }
  return allowedOrigins.some((origin) => {
    try {
      return new URL(origin).origin === parsed.origin;
    } catch {
      return false;
    }
  });
}
