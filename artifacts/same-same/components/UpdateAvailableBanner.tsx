import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSegments } from "expo-router";

import { Icon } from "@/components/Icon";
import { PressableScale } from "@/components/PressableScale";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  dismissUpdateBanner,
  isUpdatePreviewMode,
  onAppForeground,
  shouldShowUpdateBanner,
  type AppUpdateInfo,
} from "@/utils/appUpdate";

const DEFAULT_UPDATE_MESSAGE =
  "A new version of SameWave is ready on the Play Store with improved photo matching and fixes.";

export function UpdateAvailableBanner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const { hasHydrated, onboardingComplete } = useApp();
  const [info, setInfo] = useState<AppUpdateInfo | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const modalShownThisSession = useRef(false);
  const modalVisibleRef = useRef(false);

  const firstSegment = segments[0] as string | undefined;
  const onOnboarding = firstSegment === "onboarding";

  const refresh = useCallback(async () => {
    const { show, info: next } = await shouldShowUpdateBanner();
    setInfo(next);
    if (!show || !next) {
      setBannerVisible(false);
      setModalVisible(false);
      modalVisibleRef.current = false;
      return;
    }
    if (!modalShownThisSession.current) {
      modalShownThisSession.current = true;
      modalVisibleRef.current = true;
      setModalVisible(true);
      setBannerVisible(false);
    } else if (!modalVisibleRef.current) {
      setBannerVisible(true);
    }
  }, []);

  useEffect(() => {
    const preview = isUpdatePreviewMode();
    if (!preview && (!hasHydrated || !onboardingComplete || onOnboarding)) {
      setBannerVisible(false);
      setModalVisible(false);
      return;
    }
    void refresh();
    return onAppForeground(() => {
      void refresh();
    });
  }, [hasHydrated, onboardingComplete, onOnboarding, refresh]);

  if (!info) return null;

  const openStore = () => {
    void Linking.openURL(info.playStoreUrl).catch(() => {});
  };

  const dismissForVersion = () => {
    void dismissUpdateBanner(info.latestVersionCode).then(() => {
      setBannerVisible(false);
      setModalVisible(false);
      modalVisibleRef.current = false;
    });
  };

  const remindLater = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    modalVisibleRef.current = false;
    setModalVisible(false);
    setBannerVisible(true);
  };

  const message = info.updateMessage ?? DEFAULT_UPDATE_MESSAGE;

  return (
    <>
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent
        onRequestClose={remindLater}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.borderSubtle,
                marginBottom: insets.bottom + 16,
              },
            ]}
          >
            <View style={[styles.modalIconWrap, { backgroundColor: colors.primary + "18" }]}>
              <Icon name="download" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Update available
            </Text>
            <Text style={[styles.modalVersion, { color: colors.mutedForeground }]}>
              Version {info.latestVersionName} is on the Play Store
            </Text>
            <Text style={[styles.modalBody, { color: colors.foreground }]}>
              {message}
            </Text>
            <PressableScale
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                openStore();
              }}
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.primaryBtnText}>Update on Play Store</Text>
            </PressableScale>
            <Pressable
              onPress={remindLater}
              style={styles.secondaryBtn}
              accessibilityRole="button"
            >
              <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>
                Remind me later
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {bannerVisible ? (
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
            <Pressable
              style={styles.main}
              onPress={openStore}
              accessibilityRole="button"
            >
              <Icon name="download" size={18} color={colors.primary} />
              <Text
                style={[styles.text, { color: colors.foreground }]}
                numberOfLines={2}
              >
                Update available — v{info.latestVersionName} on Play Store
              </Text>
            </Pressable>
            <Pressable
              onPress={dismissForVersion}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Dismiss update notice"
            >
              <Icon name="x" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    alignItems: "center",
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  modalVersion: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 20,
  },
  primaryBtn: {
    width: "100%",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 8,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
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
