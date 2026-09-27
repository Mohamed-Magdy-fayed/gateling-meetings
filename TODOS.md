# TODOs

Deferred from the /autoplan review of "host controls in the sharing popup + presentation pen" (2026-09-26).

## Meetings

- **Floating window for the host when not sharing** (P3, human: M / CC: S)
  - Why: hosts presenting in-tab or reading notes still want a people view with moderation.
  - Context: `use-picture-in-picture.ts` ties the window's lifetime to `active` (screen share on). Needs an explicit open/close independent of sharing.

- **Late-joiner annotation replay** (P3, human: M / CC: S)
  - Why: people who join mid-presentation don't see existing ink.
  - Context: the sharer (or host) answers an `annotation-sync` request with current strokes from `annotations/store.ts`; needs size limits and a new protocol kind.

- **Export annotated snapshot as PNG** (P3, human: M / CC: S)
  - Why: keep what was pointed at after the call.
  - Context: draw the current share video frame plus the SVG overlay onto a canvas.

- **In-app slides/PDF presentation with native ink** (P3, human: XL / CC: L)
  - Why: presenters can then point at their own content without leaving it; ink aligns for everyone, including Safari/Firefox.
  - Context: raised by the CEO review as the 10x reframe; reuses the annotation store and transport.

- **Remove the deprecated `host.muteParticipant` alias** (P3, human: S / CC: S)
  - Why: `host.muteMicrophone` is canonical; the alias only covers rollout skew.
  - Depends on: one release after the host-controls change ships.

- **Per-org default for "Allow annotations"** (P3, human: S / CC: S)
  - Why: some orgs will want annotations off by default.

- **Production telemetry for annotation drops** (P3, human: S / CC: S)
  - Why: dev-only counters exist; production has no signal if strokes are being dropped.

- **Screen-reader announcements for ink** (P3, human: S / CC: S)
  - Why: blind participants miss what others point at ("Omar is drawing").

- **DESIGN.md for the product** (P3, human: M / CC: S)
  - Why: tokens are only implied by `globals.css`; run `/design-consultation`.

- **Enable gstack designer mockups** (P3, human: S / CC: S)
  - Why: design reviews fell back to text wireframes; run the designer's `setup` with an OpenAI key.
