import React, { useCallback } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";

import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useSubscription } from "@/lib/revenuecat";

type ProPaywallModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Called after purchase or restore grants Pro (e.g. run AI suggest). */
  onUnlocked?: () => void;
  title?: string;
  subtitle?: string;
  /** Short line under the title (e.g. free manual path). */
  note?: string;
  features: string[];
  finePrint?: string;
};

export function ProPaywallModal({
  visible,
  onClose,
  onUnlocked,
  title = "SameWave Pro",
  subtitle,
  note,
  features,
  finePrint = "Price and billing period are shown in the store before you confirm.",
}: ProPaywallModalProps) {
  const colors = useColors();
  const {
    proPackage,
    priceString,
    purchase,
    restore,
    isLoading: billingLoading,
    isPurchasing,
    isRestoring,
  } = useSubscription();

  const priceLine =
    subtitle ??
    (priceString
      ? `${priceString} · billed by your app store`
      : "Unlock via your app store");

  const handleUnlock = useCallback(async () => {
    if (isPurchasing || isRestoring) return;
    if (!proPackage) {
      try {
        const info = await restore();
        if (info.entitlements.active?.pro != null) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onClose();
          onUnlocked?.();
          return;
        }
        Alert.alert(
          "Pro isn't available right now",
          "We couldn't find a previous purchase on this account. Try again in a moment.",
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Please try again.";
        Alert.alert("Couldn't complete purchase", msg);
      }
      return;
    }
    try {
      const info = await purchase();
      if (info.entitlements.active?.pro != null) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onClose();
        onUnlocked?.();
      }
    } catch (err: unknown) {
      const cancelled =
        err &&
        typeof err === "object" &&
        "userCancelled" in err &&
        (err as { userCancelled?: boolean }).userCancelled;
      if (cancelled) return;
      const msg = err instanceof Error ? err.message : "Please try again.";
      Alert.alert("Couldn't complete purchase", msg);
    }
  }, [
    isPurchasing,
    isRestoring,
    onClose,
    onUnlocked,
    proPackage,
    purchase,
    restore,
  ]);

  const handleRestore = useCallback(async () => {
    if (isRestoring) return;
    try {
      const info = await restore();
      if (info.entitlements.active?.pro != null) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onClose();
        onUnlocked?.();
      } else {
        Alert.alert(
          "Nothing to restore",
          "We couldn't find a previous Pro purchase on this account.",
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Please try again.";
      Alert.alert("Couldn't restore", msg);
    }
  }, [isRestoring, onClose, onUnlocked, restore]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          onPress={(e) => e.stopPropagation?.()}
        >
          <TouchableOpacity
            onPress={onClose}
            style={styles.close}
            accessibilityLabel="Close"
          >
            <Icon name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>

          <Icon name="wave" size={40} color={colors.gold} style={styles.sparkle} />
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          {note ? (
            <Text style={[styles.note, { color: colors.mutedForeground }]}>{note}</Text>
          ) : null}
          <Text style={[styles.price, { color: colors.gold }]}>{priceLine}</Text>

          <View style={styles.features}>
            {features.map((line) => (
              <View key={line} style={styles.feature}>
                <Icon name="check" size={16} color={colors.teal} />
                <Text style={[styles.featureText, { color: colors.foreground }]}>
                  {line}
                </Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[
              styles.cta,
              {
                backgroundColor: colors.gold,
                opacity:
                  isPurchasing || isRestoring || billingLoading ? 0.6 : 1,
              },
            ]}
            onPress={handleUnlock}
            activeOpacity={0.85}
            disabled={isPurchasing || isRestoring || billingLoading}
          >
            <Text style={styles.ctaText}>
              {isPurchasing
                ? "Opening store…"
                : isRestoring
                  ? "Restoring…"
                  : priceString
                    ? `Unlock for ${priceString}`
                    : "Unlock Pro"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleRestore}
            disabled={isRestoring}
            accessibilityLabel="Restore previous purchase"
            style={styles.restore}
          >
            <Text style={[styles.restoreText, { color: colors.mutedForeground }]}>
              {isRestoring ? "Restoring…" : "Restore purchase"}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.finePrint, { color: colors.mutedForeground }]}>
            {finePrint}
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 8,
  },
  close: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  sparkle: { marginTop: 4 },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  note: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  price: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
    textAlign: "center",
  },
  features: {
    width: "100%",
    gap: 10,
    paddingVertical: 10,
  },
  feature: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  cta: {
    width: "100%",
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  ctaText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#001018",
  },
  restore: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    marginTop: 4,
  },
  restoreText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textDecorationLine: "underline",
  },
  finePrint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 15,
  },
});
