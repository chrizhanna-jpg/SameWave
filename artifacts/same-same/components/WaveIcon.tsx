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

// SameWave wave glyph — the brand app-icon artwork rendered as a small
// square. Used inline in copy ("…it's a Wave [icon] — …") and on the
// paywall hero. The artwork includes the wordmark, so we render at 2x
// the icon registry's requested size so it stays legible/readable at
// the small inline sizes other glyphs use (11–18 px → 22–36 px here).
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

export default WaveIcon;
