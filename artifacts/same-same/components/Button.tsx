import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type ViewStyle,
} from "react-native";

import { Txt } from "@/components/Txt";
import { colors, layout, radius, space } from "@/theme";

interface Props {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  /**
   * main: logo-blue fill — the one clear action a screen may have.
   * soft: a second, calmer choice on surface.
   * quiet: a line of text.
   */
  kind?: "main" | "soft" | "quiet";
  /**
   * Shown on the same line after the label as " · {detail}".
   * Never wraps — long names ellipsize at the tail (360dp Android).
   */
  detail?: string;
  tone?: "secondary" | "primary" | "ember" | "haze" | "mist" | "white";
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  kind = "main",
  detail,
  tone,
  disabled,
  busy,
  style,
  accessibilityHint,
}: Props) {
  const inactive = disabled || busy;
  const a11y = detail ? `${label} · ${detail}` : label;
  if (kind === "quiet") {
    return (
      <Pressable
        onPress={onPress}
        disabled={inactive}
        hitSlop={layout.hitSlop}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityHint={accessibilityHint}
        style={({ pressed }) => [styles.quiet, (pressed || inactive) && styles.dim, style]}
      >
        <Txt variant="quiet" tone={tone ?? "secondary"} center numberOfLines={1} ellipsizeMode="tail">
          {detail ? `${label} · ${detail}` : label}
        </Txt>
      </Pressable>
    );
  }
  const main = kind === "main";
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      style={({ pressed }) => [
        styles.base,
        main ? styles.main : styles.soft,
        pressed && styles.pressed,
        disabled && styles.dim,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.textPrimary} />
      ) : detail ? (
        <View style={styles.row}>
          <Txt variant="button" tone="primary" numberOfLines={1}>
            {label}
          </Txt>
          <Txt variant="button" tone="secondary" style={styles.sep} numberOfLines={1}>
            {" · "}
          </Txt>
          <Txt
            variant="quiet"
            tone="secondary"
            numberOfLines={1}
            ellipsizeMode="tail"
            style={styles.detail}
          >
            {detail}
          </Txt>
        </View>
      ) : (
        <Txt variant="button" tone="primary" center>
          {label}
        </Txt>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: layout.buttonHeight,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
    alignSelf: "stretch",
  },
  main: { backgroundColor: colors.waterMid },
  soft: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  quiet: { paddingVertical: space.sm, paddingHorizontal: space.md, alignSelf: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    maxWidth: "100%",
    paddingHorizontal: space.xs,
  },
  sep: { flexShrink: 0 },
  detail: { flexShrink: 1, fontSize: 14, lineHeight: 20 },
  pressed: { opacity: 0.85 },
  dim: { opacity: 0.5 },
});
