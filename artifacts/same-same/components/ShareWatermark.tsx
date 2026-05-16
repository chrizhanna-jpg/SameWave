import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Icon } from "@/components/Icon";
import { SHARE_COLORS, type ShareLayoutTokens } from "@/utils/shareLayoutTokens";

type ShareWatermarkProps = {
  layout: ShareLayoutTokens;
  /** Compact brand line when Pro removes the full watermark. */
  compact?: boolean;
};

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
        <Icon name="wave" size={layout.watermarkIcon} color="#FFFFFF" />
        <Text
          style={[styles.watermarkTitle, { fontSize: layout.watermarkTitle }]}
        >
          SameWave
        </Text>
      </View>
      <Text
        style={[
          styles.watermarkSub,
          { fontSize: layout.watermarkSub, color: SHARE_COLORS.wave },
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
    borderColor: SHARE_COLORS.wave,
    gap: 4,
  },
  watermarkRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  watermarkTitle: {
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  watermarkSub: {
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
});
