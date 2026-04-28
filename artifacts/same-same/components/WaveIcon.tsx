import React from "react";
import { Image } from "react-native";

type WaveIconProps = {
  size?: number;
  // Kept for API compatibility with the rest of the icon registry —
  // the brand artwork has its own baked-in palette so these props are
  // intentionally ignored. Call sites can keep passing them without
  // changes when the wave glyph is wired through <Icon name="wave" />.
  color?: string;
  strokeWidth?: number;
  style?: object;
};

// SameWave wave wordmark — the brand app-icon artwork rendered as a
// small square. Used as the watermark on share photos, on the paywall
// hero, and anywhere the wordmark + glyph combo is the right read. The
// artwork includes the wordmark, so we render at 2x the icon registry's
// requested size so it stays legible at the small inline sizes other
// glyphs use (11–18 px → 22–36 px here).
const WAVE_SCALE = 2;

export function WaveIcon({ size = 24, style }: WaveIconProps) {
  const rendered = size * WAVE_SCALE;
  return (
    <Image
      source={require("@/assets/images/samewave-logo.png")}
      style={[{ width: rendered, height: rendered }, style as object]}
      resizeMode="contain"
    />
  );
}

// Standalone wave glyph (no wordmark) — the wide horizontal wave
// artwork with a transparent background. Used inline in tutorial copy
// ("…it's a Wave [glyph]") and as the title flanks on the Wave share
// card ("[glyph] Wave [glyph]"). Renders at the registry size with a
// 3:1 aspect ratio that matches the source artwork, so it sits neatly
// next to text without the square letterboxing the wordmark variant
// would produce.
export function WaveGlyphIcon({ size = 24, style }: WaveIconProps) {
  return (
    <Image
      source={require("@/assets/images/samewave-glyph.png")}
      style={[{ width: size * 3, height: size }, style as object]}
      resizeMode="contain"
    />
  );
}

export default WaveIcon;
