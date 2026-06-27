import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";

/**
 * Soft, neutral note shown only when a temporal match was computed from a
 * photo's upload/share time because its real capture date was unknown (see
 * `TimeTier.usedShareFallback`). It is deliberately NOT a warning — no jargon,
 * no error styling — just a gentle "here's why" plus a low-pressure nudge to
 * use the in-app camera next time for a live, capture-timed moment.
 *
 * Rendered next to where the time tier is shown (celebration flashes, the
 * reveal screen, the echo-pair view). It is intentionally kept OFF the
 * exported share posters so shared images stay clean.
 */
export function CaptureTimeNote({
  onLight = false,
  align = "center",
  style,
}: {
  /** True on a light/coloured celebration backdrop → use dark ink instead of muted theme colour. */
  onLight?: boolean;
  align?: "center" | "left";
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const ink = onLight ? "rgba(0,16,24,0.62)" : colors.mutedForeground;

  return (
    <View
      style={[
        styles.row,
        align === "center" ? styles.center : styles.left,
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel="Matched by when you shared it. Snap your next moment in the app to match on the real time."
    >
      <Icon name="camera" size={13} color={ink} />
      <Text
        style={[
          styles.text,
          { color: ink, textAlign: align === "center" ? "center" : "left" },
        ]}
      >
        Matched by when you shared it · snap your next moment in the app for a
        live time match
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 320,
  },
  center: {
    justifyContent: "center",
    alignSelf: "center",
  },
  left: {
    justifyContent: "flex-start",
    alignSelf: "flex-start",
  },
  text: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.1,
  },
});
