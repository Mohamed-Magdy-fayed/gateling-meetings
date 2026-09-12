import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

/**
 * Where to send the person after they leave the room, and what to call the
 * place. Set by `/sso/join`, read by `/m/[code]`, shown by `LeftScreen` as
 * "Back to <integration>". Signed so a value the browser presents was put
 * there by us (the URL was already checked against the integration's
 * allowed origins at mint time — this keeps that check meaningful).
 */
export const RETURN_COOKIE_NAME = "meetings-return";
const RETURN_COOKIE_TTL_SECONDS = 24 * 60 * 60;
const RETURN_ISSUER = "meetings:return";

export const returnTargetSchema = z.object({
  url: z.url(),
  /** Integration name — the button label. */
  name: z.string().min(1).max(128),
  meetingCode: z.string().min(1),
});

export type ReturnTarget = z.infer<typeof returnTargetSchema>;

function keyFor(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signReturnTarget(
  secret: string,
  target: ReturnTarget,
): Promise<string> {
  return new SignJWT(target)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(RETURN_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${RETURN_COOKIE_TTL_SECONDS}s`)
    .sign(keyFor(secret));
}

/** `null` for a missing, tampered, expired, or other-meeting cookie. */
export async function readReturnTarget(
  secret: string,
  value: string | undefined,
  meetingCode: string,
): Promise<ReturnTarget | null> {
  if (!value) return null;
  try {
    const { payload } = await jwtVerify(value, keyFor(secret), {
      issuer: RETURN_ISSUER,
      algorithms: ["HS256"],
    });
    const parsed = returnTargetSchema.safeParse(payload);
    if (!parsed.success || parsed.data.meetingCode !== meetingCode) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export const returnCookieOptions = (secure: boolean) => ({
  httpOnly: true,
  secure,
  sameSite: "lax" as const,
  path: "/",
  maxAge: RETURN_COOKIE_TTL_SECONDS,
});
