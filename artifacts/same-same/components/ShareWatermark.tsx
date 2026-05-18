import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Icon } from "@/components/Icon";
import { SHARE_COLORS, type ShareLayoutTokens } from "@/utils/shareLayoutTokens";

type ShareWatermarkProps = {
  layout: ShareLayoutTokens;
  /** Compact brand line when Pro removes the full watermark. */
  compact?: boolean;
};

/** Keeps “SameWave” readable on busy share posters without a solid pill. */
const READABILITY_SHADOW = {
  textShadowColor: "rgba(0, 16, 24, 0.9)",
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 5,
} as const;

export function ShareWatermark({ layout, compact = false }: ShareWatermarkProps) {
  if (compact) {
    return (
      <View style={[styles.brandRow, { gap: layout.gapXs }]}>
        <Icon name="wave" size={layout.brandFooterIcon} color={SHARE_COLORS.wave} />
        <Text
          style={[
            styles.brandText,
            { fontSize: layout.brandFooterFont, color: SHARE_COLORS.textMuted },
          ]}
        >
          SameWave
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.watermark,
        {
          paddingVertical: layout.watermarkPadV,
          paddingHorizontal: layout.watermarkPadH,
          borderRadius: layout.radiusWatermark,
          borderWidth: layout.watermarkBorder,
        },
      ]}
    >
      <View style={[styles.watermarkRow, { gap: layout.gapSm }]}>
        <Icon name="wave" size={layout.watermarkIcon} color={SHARE_COLORS.text} />
        <Text
          style={[
            styles.watermarkTitle,
            { fontSize: layout.watermarkTitle },
            READABILITY_SHADOW,
          ]}
        >
          SameWave
        </Text>
      </View>
      <Text
        style={[
          styles.watermarkSub,
          { fontSize: layout.watermarkSub, color: SHARE_COLORS.wave },
          READABILITY_SHADOW,
        ]}
      >
        Find it on Google Play
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: {
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  watermark: {
    alignSelf: "center",
    alignItems: "center",
    backgroundColor: SHARE_COLORS.watermarkBg,
    borderColor: SHARE_COLORS.watermarkBorder,
    gap: 4,
  },
  watermarkRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  watermarkTitle: {
    fontFamily: "Inter_700Bold",
    color: SHARE_COLORS.text,
    letterSpacing: -0.3,
  },
  watermarkSub: {
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
});
