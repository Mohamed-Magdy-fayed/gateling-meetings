/** Timings for the floating window's controls; code and tests share them. */
export const PIP_TIMINGS = {
  /** A mic/camera toggle still pending after this shows the permission hint. */
  TOGGLE_TIMEOUT_MS: 8_000,
  /** Inline media errors in the floating window clear themselves after this. */
  MEDIA_ERROR_DISMISS_MS: 8_000,
  /** At most one knock chime this often, however many people knock. */
  CHIME_MIN_INTERVAL_MS: 10_000,
  /** "{name} admitted" / "declined" stays in the strip this long. */
  ADMIT_NOTICE_MS: 2_000,
} as const;
