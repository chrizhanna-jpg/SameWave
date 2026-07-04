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

export type RipplePhotoCropRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

export type RipplePhotoGuideRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  aspectRatio: number;
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
export function getRipplePhotoGuideRect(
  insets: RipplePhotoFrameInsets,
): RipplePhotoGuideRect {
  const frame = getRipplePhotoPaneMetrics(insets);
  return {
    left: (SCREEN_W - frame.width) / 2,
    top: (SCREEN_H - frame.height) / 2,
    width: frame.width,
    height: frame.height,
    aspectRatio: frame.aspectRatio,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Map preview cover-fill coordinates to stored JPEG pixels.
 * Portrait screen + landscape buffer rotates preview 90° CW (typical back camera).
 */
function mapPreviewCropToImage(
  imageWidth: number,
  imageHeight: number,
  px: number,
  py: number,
  cropW: number,
  cropH: number,
  rotate90: boolean,
  mirrorX: boolean,
): RipplePhotoCropRect {
  if (rotate90) {
    const originX = clamp(py, 0, imageHeight - cropH);
    const originY = clamp(imageWidth - px - cropW, 0, imageWidth - cropW);
    return {
      originX: Math.round(originX),
      originY: Math.round(originY),
      width: Math.round(cropH),
      height: Math.round(cropW),
    };
  }
  let originX = px;
  if (mirrorX) originX = imageWidth - px - cropW;
  return {
    originX: Math.round(clamp(originX, 0, imageWidth - cropW)),
    originY: Math.round(clamp(py, 0, imageHeight - cropH)),
    width: Math.round(cropW),
    height: Math.round(cropH),
  };
}

/**
 * Crop the region visible inside the white guide on a full-screen cover-fill
 * preview. Output aspect matches `getRipplePhotoPaneMetrics` (one Ripple pane).
 */
export function computeRipplePhotoGuideCrop(
  imageWidth: number,
  imageHeight: number,
  guide: RipplePhotoGuideRect,
  opts?: {
    screenW?: number;
    screenH?: number;
    /** Front/selfie preview mirror — flip crop horizontally. */
    mirrorX?: boolean;
  },
): RipplePhotoCropRect {
  const screenW = opts?.screenW ?? SCREEN_W;
  const screenH = opts?.screenH ?? SCREEN_H;
  const portraitScreen = screenH >= screenW;

  let rotate90 = false;
  let previewW = imageWidth;
  let previewH = imageHeight;
  if (portraitScreen && imageWidth > imageHeight) {
    rotate90 = true;
    previewW = imageHeight;
    previewH = imageWidth;
  }

  const scale = Math.max(screenW / previewW, screenH / previewH);
  const offsetX = (previewW * scale - screenW) / 2;
  const offsetY = (previewH * scale - screenH) / 2;

  const px = (guide.left + offsetX) / scale;
  const py = (guide.top + offsetY) / scale;
  const cropW = guide.width / scale;
  const cropH = guide.height / scale;

  return mapPreviewCropToImage(
    imageWidth,
    imageHeight,
    px,
    py,
    cropW,
    cropH,
    rotate90,
    opts?.mirrorX ?? false,
  );
}

/**
 * Crop when the live preview is clipped to the guide viewport (WYSIWYG).
 * Visible preview = center cover-fill inside the guide box.
 */
export function computeRipplePhotoViewportCrop(
  imageWidth: number,
  imageHeight: number,
  guide: Pick<RipplePhotoGuideRect, "width" | "height" | "aspectRatio">,
  opts?: { mirrorX?: boolean },
): RipplePhotoCropRect {
  const targetAspect = guide.width / guide.height;
  const imageAspect = imageWidth / imageHeight;

  let originX: number;
  let originY: number;
  let width: number;
  let height: number;

  if (imageAspect > targetAspect) {
    height = imageHeight;
    width = height * targetAspect;
    originX = (imageWidth - width) / 2;
    originY = 0;
  } else {
    width = imageWidth;
    height = width / targetAspect;
    originX = 0;
    originY = (imageHeight - height) / 2;
  }

  if (opts?.mirrorX) {
    originX = imageWidth - originX - width;
  }

  return {
    originX: Math.round(clamp(originX, 0, imageWidth - 1)),
    originY: Math.round(clamp(originY, 0, imageHeight - 1)),
    width: Math.round(clamp(width, 1, imageWidth)),
    height: Math.round(clamp(height, 1, imageHeight)),
  };
}

/** @deprecated Use computeRipplePhotoGuideCrop or computeRipplePhotoViewportCrop */
export function computeRipplePhotoCenterCrop(
  imageWidth: number,
  imageHeight: number,
  insets: RipplePhotoFrameInsets,
): RipplePhotoCropRect {
  const frame = getRipplePhotoPaneMetrics(insets);
  return computeRipplePhotoViewportCrop(imageWidth, imageHeight, frame);
}

/** Test helper — guide aspect must match Ripple pane aspect. */
export function rippleGuideMatchesPaneAspect(
  insets: RipplePhotoFrameInsets,
  tolerance = 0.001,
): boolean {
  const pane = getRipplePhotoPaneMetrics(insets);
  const guide = getRipplePhotoGuideRect(insets);
  return Math.abs(pane.aspectRatio - guide.aspectRatio) < tolerance;
}
