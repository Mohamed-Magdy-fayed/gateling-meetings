import { translationKey } from "@/features/core/i18n/global";

/**
 * `?error=`/`?oauthError=` query params carry one of these fixed codes, never
 * a free-form message — rendering an attacker-supplied query string directly
 * would let a crafted link (`/auth/sign-in?error=...`) make the app display
 * arbitrary text inside a styled "error" alert.
 */
const AUTH_ERROR_MESSAGE_KEYS = {
  oauth_failed: translationKey("auth.oauth.error.failed"),
  session_failed: translationKey("auth.signUp.error.sessionFailed"),
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERROR_MESSAGE_KEYS;

export function authErrorMessageKey(code: string | null) {
  return code && code in AUTH_ERROR_MESSAGE_KEYS
    ? AUTH_ERROR_MESSAGE_KEYS[code as AuthErrorCode]
    : translationKey("errors.generic");
}
