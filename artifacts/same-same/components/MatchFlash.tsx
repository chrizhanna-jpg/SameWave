import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { tagEmoji, tagLabel } from "@/utils/interests";

interface Props {
  theirCountry: string;
  theirCountryFlag: string;
  myCountryFlag?: string;
  themeTitle: string;
  themeEmoji: string;
  sharedTags: string[];
  onDone: () => void;
  onOpenFull: () => void;
  // How long the flash stays before auto-advancing.
  durationMs?: number;
}

// Per-swipe celebration that overlays the swipe card. Designed to feel
// like a beat in the rhythm — not a full stop. Shows the country reveal,
// the shared theme, and (when present) shared interests, then auto-fades
// and triggers `onDone` so SwipeScreen can load the next candidate.
//
// Tap-anywhere → skip the flash and advance immediately.
// Tap the "Open" pill → navigate to the full /reveal screen for the user
// who wants to dwell on this match (Connect, Share, paywall, etc.).
export function MatchFlash({
  theirCountry,
  theirCountryFlag,
  myCountryFlag,
  themeTitle,
  themeEmoji,
  sharedTags,
  onDone,
  onOpenFull,
  durationMs = 1700,
}: Props) {
  const colors = useColors();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  const flagPop = useRef(new Animated.Value(0)).current;
  // Guard to make sure auto-dismiss fires exactly once even if the user
  // also taps. The animation runs on the native driver, so we can't read
  // `fade._value` reliably from JS.
  const finishedRef = useRef(false);

  const finish = (open = false) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    Animated.timing(fade, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      if (open) onOpenFull();
      else onDone();
    });
  };

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        tension: 120,
        friction: 9,
        useNativeDriver: true,
      }),
      Animated.timing(flagPop, {
        toValue: 1,
        duration: 520,
        delay: 80,
        easing: Easing.out(Easing.back(1.6)),
        useNativeDriver: true,
      }),
    ]).start();

    const t = setTimeout(() => finish(false), durationMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flagScale = flagPop.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });
  const flagOpacity = flagPop;

  const top3 = sharedTags.slice(0, 3);

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={() => finish(false)}
      accessibilityLabel="Same same! Tap to keep swiping"
    >
      <Animated.View
        style={[
          styles.backdrop,
          { backgroundColor: colors.teal + "ee", opacity: fade },
        ]}
      />
      <Animated.View
        style={[
          styles.center,
          { opacity: fade, transform: [{ scale }] },
        ]}
        pointerEvents="box-none"
      >
        <Text style={styles.tagline}>same same</Text>
        <View style={styles.flagsRow}>
          <Animated.Text
            style={[
              styles.flag,
              {
                opacity: flagOpacity,
                transform: [{ scale: flagScale }],
              },
            ]}
          >
            {myCountryFlag || "🌍"}
          </Animated.Text>
          <View style={styles.connector}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
          <Animated.Text
            style={[
              styles.flag,
              {
                opacity: flagOpacity,
                transform: [{ scale: flagScale }],
              },
            ]}
          >
            {theirCountryFlag || "🌍"}
          </Animated.Text>
        </View>
        <Text style={styles.country}>{theirCountry}</Text>
        <View style={styles.themePill}>
          <Text style={styles.themeEmoji}>{themeEmoji}</Text>
          <Text style={styles.themeText}>{themeTitle}</Text>
        </View>
        {top3.length > 0 && (
          <View style={styles.tagsRow}>
            {top3.map((t) => (
              <View key={t} style={styles.tagChip}>
                <Text style={styles.tagEmoji}>{tagEmoji(t)}</Text>
                <Text style={styles.tagText}>{tagLabel(t)}</Text>
              </View>
            ))}
          </View>
        )}

        <Pressable
          onPress={(e) => {
            // Stop the outer Pressable from firing finish(false).
            e.stopPropagation?.();
            finish(true);
          }}
          style={styles.openPill}
          accessibilityLabel="Open full match"
        >
          <Text style={styles.openText}>Open</Text>
          <Icon name="arrow-right" size={14} color="#001018" />
        </Pressable>

        <Text style={styles.hint}>tap anywhere to keep swiping</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  tagline: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 4,
    color: "rgba(0,16,24,0.55)",
    textTransform: "uppercase",
    marginBottom: 14,
  },
  flagsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 12,
  },
  flag: {
    fontSize: 56,
  },
  connector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(0,16,24,0.55)",
  },
  country: {
    fontSize: 22,
    fontWeight: "800",
    color: "#001018",
    marginBottom: 14,
    textAlign: "center",
  },
  themePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,16,24,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: 12,
  },
  themeEmoji: {
    fontSize: 18,
  },
  themeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#001018",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    marginBottom: 18,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  tagEmoji: {
    fontSize: 12,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#001018",
  },
  openPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    marginTop: 4,
  },
  openText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#001018",
    letterSpacing: 0.5,
  },
  hint: {
    marginTop: 14,
    fontSize: 11,
    color: "rgba(0,16,24,0.55)",
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});
