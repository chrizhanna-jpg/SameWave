import React, { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSegments } from "expo-router";

import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  dismissUpdateBanner,
  onAppForeground,
  shouldShowUpdateBanner,
  type AppUpdateInfo,
} from "@/utils/appUpdate";

export function UpdateAvailableBanner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const { hasHydrated, onboardingComplete } = useApp();
  const [info, setInfo] = useState<AppUpdateInfo | null>(null);
  const [visible, setVisible] = useState(false);

  const firstSegment = segments[0] as string | undefined;
  const onOnboarding = firstSegment === "onboarding";

  const refresh = useCallback(async () => {
    const { show, info: next } = await shouldShowUpdateBanner();
    setInfo(next);
    setVisible(show);
  }, []);

  useEffect(() => {
    if (!hasHydrated || !onboardingComplete || onOnboarding) {
      setVisible(false);
      return;
    }
    void refresh();
    return onAppForeground(() => {
      void refresh();
    });
  }, [hasHydrated, onboardingComplete, onOnboarding, refresh]);

  if (!visible || !info) return null;

  const openStore = () => {
    void Linking.openURL(info.playStoreUrl).catch(() => {});
  };

  const dismiss = () => {
    void dismissUpdateBanner(info.latestVersionCode).then(() => {
      setVisible(false);
    });
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + 6, paddingHorizontal: 12 }]}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.borderSubtle,
          },
        ]}
      >
        <Pressable style={styles.main} onPress={openStore} accessibilityRole="button">
          <Icon name="download" size={18} color={colors.primary} />
          <Text style={[styles.text, { color: colors.foreground }]} numberOfLines={2}>
            Update available — v{info.latestVersionName} is on Play Store
          </Text>
        </Pressable>
        <Pressable
          onPress={dismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dismiss update notice"
        >
          <Icon name="x" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 50,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  main: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
});
