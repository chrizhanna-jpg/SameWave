import React, { useCallback } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GradientCard } from "@/components/GradientCard";
import { PressableScale } from "@/components/PressableScale";
import { useColors } from "@/hooks/useColors";
import { markTabVisited } from "@/utils/tabVisits";
import { scrollPaddingAboveTabBar } from "@/utils/tabBarSafeArea";

/** Send today's photo. One action. The swipe deck is not this screen. */
export default function RippleSendScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  useFocusEffect(
    useCallback(() => {
      markTabVisited("ripple");
    }, []),
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.center,
          { paddingTop: topPadding + 32, paddingBottom: 24 },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>
          Share your moment
        </Text>
        <PressableScale
          onPress={() => router.push("/camera")}
          haptic="medium"
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel="Send a Ripple"
        >
          <GradientCard
            gradient="primary"
            radius="pill"
            elevation="glowPrimary"
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <View style={styles.actionInner}>
              <Text style={styles.actionText}>Send a Ripple</Text>
            </View>
          </GradientCard>
        </PressableScale>
      </View>
      <Pressable
        onPress={() => router.push("/account")}
        accessibilityRole="button"
        accessibilityLabel="Account"
        style={[
          styles.account,
          { marginBottom: scrollPaddingAboveTabBar(insets, 8) },
        ]}
      >
        <Text style={[styles.accountText, { color: colors.mutedForeground }]}>
          Account
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 32,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 36,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  action: {
    width: "100%",
  },
  actionInner: {
    height: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  account: {
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  accountText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});
