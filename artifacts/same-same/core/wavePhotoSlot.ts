/**
 * Geometry of one Wave photograph slot (top or bottom half, including the
 * shared wave-seam band). Camera capture and gallery picks crop to this
 * aspect so the match screen can show the frame without further surprise crop.
 *
 * Pure math — call with `waveLayoutMetrics()` width/height so Match and crop
 * share the same full-bleed dimensions.
 */
import { joinBandHeight } from "@/core/waveJoin";

export type WavePhotoSlot = {
  /** Full-screen width used for the slot. */
  width: number;
  /** Half screen plus half the seam band (same as WaveJoin top/bottom boxes). */
  height: number;
  /** width / height — use for preview frames and ImageManipulator crops. */
  aspectRatio: number;
  /** Seam band height in points; bottom of the top photo is partially under this. */
  seamBand: number;
};

/** Slot size for a Wave on a screen of `screenWidth` × `screenHeight`. */
export function wavePhotoSlot(screenWidth: number, screenHeight: number): WavePhotoSlot {
  const width = Math.max(1, screenWidth);
  const height = Math.max(1, screenHeight);
  const seamBand = joinBandHeight(width);
  const slotHeight = height / 2 + seamBand / 2;
  return {
    width,
    height: slotHeight,
    aspectRatio: width / slotHeight,
    seamBand,
  };
}
