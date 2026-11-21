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
  /** Optional second line under the label (e.g. today's topic name). */
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
  const a11y = detail ? `${label}. ${detail}` : label;
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
        <Txt variant="quiet" tone={tone ?? "secondary"} center>
          {label}
        </Txt>
        {detail ? (
          <Txt variant="caption" tone="quiet" center style={styles.detail}>
            {detail}
          </Txt>
        ) : null}
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
      ) : (
        <View style={styles.copy}>
          <Txt variant="button" tone="primary" center>
            {label}
          </Txt>
          {detail ? (
            <Txt variant="caption" tone="secondary" center style={styles.detail}>
              {detail}
            </Txt>
          ) : null}
        </View>
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
    paddingHorizontal: space.lg,
    alignSelf: "stretch",
  },
  main: { backgroundColor: colors.waterMid },
  soft: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  quiet: { paddingVertical: space.sm, paddingHorizontal: space.md, alignSelf: "center" },
  copy: { alignItems: "center", gap: 2 },
  detail: { marginTop: 0 },
  pressed: { opacity: 0.85 },
  dim: { opacity: 0.5 },
});
