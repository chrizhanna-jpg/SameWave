/**
 * Drawable size for Match WaveJoin + capture/library crop.
 * Prefer `screen` so edge-to-edge layouts include system-bar territory.
 */
import { Dimensions } from "react-native";

export function waveLayoutMetrics(): { width: number; height: number } {
  const window = Dimensions.get("window");
  const screen = Dimensions.get("screen");
  const width = Math.max(1, screen.width || window.width);
  const height = Math.max(1, Math.max(window.height, screen.height || 0));
  return { width, height };
}
