/** Every shared JPEG is exactly 1080×1080 (Instagram square). */
export const SHARE_EXPORT_PIXEL_SIZE = 1080;

/** On-screen square preview side length (scales up on capture). */
export const SHARE_CARD_MAX_WIDTH = 210;
export const SHARE_CARD_MIN_WIDTH = 180;

export function sharePreviewWidth(windowWidth: number): number {
  const target = Math.round(windowWidth * 0.52);
  return Math.max(
    SHARE_CARD_MIN_WIDTH,
    Math.min(SHARE_CARD_MAX_WIDTH, target),
  );
}

export function sharePreviewCompact(cardWidth: number): boolean {
  return cardWidth <= SHARE_CARD_MAX_WIDTH;
}

/** Square frame for the ViewShot target (width = height). */
export function shareShotFrameStyle(side: number) {
  return {
    width: side,
    height: side,
    alignSelf: "center" as const,
    flexShrink: 0,
    overflow: "hidden" as const,
  };
}

export function shareCaptureOptions() {
  return {
    format: "jpg" as const,
    quality: 0.92,
    result: "tmpfile" as const,
    width: SHARE_EXPORT_PIXEL_SIZE,
    height: SHARE_EXPORT_PIXEL_SIZE,
  };
}
