import { Dimensions, Platform } from "react-native";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

/** Width of the Ripple swipe card (`match.tsx` `card` style). */
export const RIPPLE_CARD_WIDTH = SCREEN_W - 24;

/** Bottom inset inside `cardArea` above the tab bar. */
const CARD_AREA_BOTTOM_PAD = Platform.OS === "web" ? 90 : 70;

/**
 * Estimated header above the swipe card (safe top + logo row + padding).
 * Keep aligned with `match.tsx` header layout.
 */
const HEADER_BLOCK_BELOW_SAFE_TOP = 76;

export type RipplePhotoFrameInsets = {
  top: number;
  bottom: number;
};

/**
 * One photo pane on the Ripple/Wave swipe card (`photoSection`, half the
 * card). Post-camera preview uses the same width, aspect ratio, and cover
 * crop so framing matches what others see while swiping.
 */
export function getRipplePhotoPaneMetrics(insets: RipplePhotoFrameInsets) {
  const cardAreaInner =
    SCREEN_H -
    insets.top -
    HEADER_BLOCK_BELOW_SAFE_TOP -
    CARD_AREA_BOTTOM_PAD -
    insets.bottom * 0.35;
  const height = Math.max(140, Math.round(cardAreaInner / 2));
  const width = RIPPLE_CARD_WIDTH;
  return {
    width,
    height,
    aspectRatio: width / height,
  };
}

/** Centered guide rect for the in-app camera overlay (matches Ripple pane). */
export function getRipplePhotoGuideRect(insets: RipplePhotoFrameInsets) {
  const frame = getRipplePhotoPaneMetrics(insets);
  return {
    left: (SCREEN_W - frame.width) / 2,
    top: (SCREEN_H - frame.height) / 2,
    width: frame.width,
    height: frame.height,
    aspectRatio: frame.aspectRatio,
  };
}

/** Center cover crop so saved photos match Ripple `resizeMode="cover"` panes. */
export function computeRipplePhotoCenterCrop(
  imageWidth: number,
  imageHeight: number,
  insets: RipplePhotoFrameInsets,
): { originX: number; originY: number; width: number; height: number } {
  const { width: targetW, height: targetH } = getRipplePhotoPaneMetrics(insets);
  const targetAspect = targetW / targetH;
  const imageAspect = imageWidth / imageHeight;

  if (imageAspect > targetAspect) {
    const height = imageHeight;
    const width = Math.round(height * targetAspect);
    return {
      originX: Math.max(0, Math.round((imageWidth - width) / 2)),
      originY: 0,
      width,
      height,
    };
  }
  const width = imageWidth;
  const height = Math.round(width / targetAspect);
  return {
    originX: 0,
    originY: Math.max(0, Math.round((imageHeight - height) / 2)),
    width,
    height,
  };
}
