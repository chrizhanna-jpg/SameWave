import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Txt } from "@/components/Txt";
import { PREVIEW_LABEL, SAMPLE_MODE } from "@/config/env";
import { colors, radius, space } from "@/theme";

/**
 * Says plainly that this is a preview running on sample data, and which
 * build it is. Never shown in a store build.
 */
export function PreviewPill() {
  const insets = useSafeAreaInsets();
  if (!SAMPLE_MODE) return null;
  return (
    <View style={[styles.wrap, { top: insets.top + space.xs }]} pointerEvents="none">
      <View style={styles.pill}>
        <Txt variant="label" tone="moonInk" numberOfLines={1}>
          {`Preview: ${PREVIEW_LABEL} · sample data`}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 10 },
  pill: {
    backgroundColor: colors.moon,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    maxWidth: "92%",
  },
});
