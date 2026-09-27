/**
 * Where the video frame actually is inside its element. The share renders
 * with `object-contain`, so a frame whose aspect ratio differs from the
 * element's is letterboxed (bars top/bottom) or pillarboxed (bars left/
 * right). Ink coordinates are 0..1 of the *frame*, so every viewer's ink
 * lines up regardless of their window size.
 */
export type Box = { left: number; top: number; width: number; height: number };

export function contentBox(
  elementWidth: number,
  elementHeight: number,
  videoWidth: number,
  videoHeight: number,
): Box | null {
  if (
    elementWidth <= 0 ||
    elementHeight <= 0 ||
    videoWidth <= 0 ||
    videoHeight <= 0
  ) {
    return null;
  }
  const scale = Math.min(
    elementWidth / videoWidth,
    elementHeight / videoHeight,
  );
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return {
    left: (elementWidth - width) / 2,
    top: (elementHeight - height) / 2,
    width,
    height,
  };
}

/** Number of ink colours, defined as `--ink-0` … `--ink-7` in room.css. */
export const INK_COLOURS = 8;

/** A stable colour slot per identity (FNV-1a), the same on every screen. */
export function inkSlot(identity: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < identity.length; i++) {
    hash ^= identity.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % INK_COLOURS;
}

export function inkColour(identity: string): string {
  return `var(--ink-${inkSlot(identity)})`;
}
