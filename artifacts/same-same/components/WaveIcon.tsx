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
// paywall hero. At very small sizes (≤14px) the wordmark inside the
// artwork isn't legible, but the rounded blue tile + green/cyan ribbon
// still reads as the brand mark, which is what we want.
export function WaveIcon({ size = 24, style }: WaveIconProps) {
  return (
    <Image
      source={require("@/assets/images/samewave-logo.png")}
      style={[{ width: size, height: size }, style as object]}
      resizeMode="contain"
    />
  );
}

export default WaveIcon;
