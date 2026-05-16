import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export type ShareLayoutMode = "card" | "atlas";

type ShareLayoutModeToggleProps = {
  value: ShareLayoutMode;
  onChange: (mode: ShareLayoutMode) => void;
};

/** Switch share export between the compact card and the atlas map poster. */
export function ShareLayoutModeToggle({
  value,
  onChange,
}: ShareLayoutModeToggleProps) {
  const colors = useColors();

  return (
    <View
      style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}
      accessibilityRole="tablist"
    >
      <Pressable
        onPress={() => onChange("card")}
        style={[
          styles.segment,
          value === "card" && { backgroundColor: colors.primary },
        ]}
        accessibilityRole="tab"
        accessibilityState={{ selected: value === "card" }}
      >
        <Text
          style={[
            styles.segmentText,
            { color: value === "card" ? colors.primaryForeground : colors.foreground },
          ]}
        >
          Share card
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange("atlas")}
        style={[
          styles.segment,
          value === "atlas" && { backgroundColor: colors.primary },
        ]}
        accessibilityRole="tab"
        accessibilityState={{ selected: value === "atlas" }}
      >
        <Text
          style={[
            styles.segmentText,
            { color: value === "atlas" ? colors.primaryForeground : colors.foreground },
          ]}
        >
          Share map
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignSelf: "stretch",
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    gap: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: "center",
  },
  segmentText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
