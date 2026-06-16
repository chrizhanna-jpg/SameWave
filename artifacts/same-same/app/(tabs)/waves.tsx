import React, { useCallback } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OceanShimmer } from "@/components/OceanShimmer";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { markTabVisited } from "@/utils/tabVisits";
import { scrollPaddingAboveTabBar } from "@/utils/tabBarSafeArea";

export default function WavesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = scrollPaddingAboveTabBar(insets);

  useFocusEffect(
    useCallback(() => {
      markTabVisited("waves");
    }, []),
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <OceanShimmer />
      <View
        style={[
          styles.content,
          {
            paddingTop: topPadding + 24,
            paddingBottom: bottomPad,
          },
        ]}
      >
        <Icon name="wave-glyph" size={48} color={colors.primary} />
        <Text style={[styles.title, { color: colors.foreground }]}>Waves</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          Under construction, coming soon: a feed showing Waves around the world
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  body: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 24,
  },
});
