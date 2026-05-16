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
