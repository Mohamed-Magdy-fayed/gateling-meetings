/** Timings for the floating window's controls; code and tests share them. */
export const PIP_TIMINGS = {
  /** A mic/camera toggle still pending after this shows the permission hint. */
  TOGGLE_TIMEOUT_MS: 8_000,
  /** Inline media errors in the floating window clear themselves after this. */
  MEDIA_ERROR_DISMISS_MS: 8_000,
} as const;
