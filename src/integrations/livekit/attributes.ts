/**
 * Participant attribute keys. Attributes ride on the participant object to
 * every peer, so a client can render a "Host" badge or a raised hand without
 * a round-trip. Shared by the server (which stamps them into tokens) and the
 * browser (which reads them), so this file must stay import-safe on both.
 */

/** `"host" | "participant"` — set server-side in the token, never by the client. */
export const PARTICIPANT_ATTRIBUTE_ROLE = "role";

/** `"1"` while the participant's hand is up; set by the participant themself. */
export const PARTICIPANT_ATTRIBUTE_HAND_RAISED = "handRaised";
