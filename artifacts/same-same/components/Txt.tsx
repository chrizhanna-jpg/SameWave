import React from "react";
import { Text, type TextProps, type TextStyle } from "react-native";

import { colors, type } from "@/theme";

type Variant = keyof typeof type;
type Tone = "primary" | "secondary" | "quiet" | "white" | "ember" | "mist" | "haze" | "moon" | "moonInk";

interface Props extends TextProps {
  variant?: Variant;
  tone?: Tone;
  center?: boolean;
  /** Soft shadow so white text stays readable over a photograph. */
  overPhoto?: boolean;
}

const TONE: Record<Tone, string> = {
  primary: colors.textPrimary,
  secondary: colors.textSecondary,
  quiet: colors.textQuiet,
  white: colors.white,
  ember: colors.ember,
  mist: colors.textPrimary,
  haze: colors.textSecondary,
  moon: colors.waterMid,
  moonInk: colors.textPrimary,
};

/** All text in the app goes through here so it always uses the theme. */
export function Txt({
  variant = "body",
  tone = "primary",
  center,
  overPhoto,
  style,
  ...rest
}: Props) {
  const shadow: TextStyle | undefined = overPhoto
    ? {
        textShadowColor: "rgba(25, 34, 36, 0.35)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
      }
    : undefined;
  return (
    <Text
      {...rest}
      style={[type[variant], { color: TONE[tone] }, center && { textAlign: "center" }, shadow, style]}
    />
  );
}
