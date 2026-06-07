import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { flagFor, nameFor } from "@/data/countries";
import {
  formatThemeTitleForDisplay,
  resolveThemeDisplay,
} from "@/utils/resolveThemeDisplay";
import type { WavefireThemeCaption } from "@/utils/wavefireThemeQueue";

const FADE_OUT_MS = 420;
const FADE_IN_MS = 680;

export function FirecircleCenterTheme(props: {
  centroid: { x: number; y: number; ringR: number };
  captions: WavefireThemeCaption[];
  focusIndex: number;
  mapScale: SharedValue<number>;
}) {
  const { centroid, captions, focusIndex, mapScale } = props;
  const opacity = useSharedValue(0);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const prevFocusRef = useRef<number | null>(null);

  const captionCount = captions.length;
  const safeIndex =
    captionCount > 0 ? ((focusIndex % captionCount) + captionCount) % captionCount : 0;

  const shown = captionCount > 0 ? captions[visibleIndex] : null;
  const shownTheme = resolveThemeDisplay(shown?.theme ?? "");
  const shownTitle = formatThemeTitleForDisplay(shownTheme.title);
  const shownCountry = shown?.countryCode
    ? nameFor(shown.countryCode) ?? shown.countryCode
    : null;

  const maxWidth = Math.min(300, Math.max(132, centroid.ringR * 2.35));
  const fontSize =
    shownTitle.length > 34 ? 12 : shownTitle.length > 26 ? 13 : 14;
  const lineHeight = fontSize + 5;

  useEffect(() => {
    if (captionCount === 0) {
      opacity.value = 0;
      prevFocusRef.current = null;
      return;
    }

    const swapTo = (idx: number) => {
      setVisibleIndex(idx);
      opacity.value = withTiming(1, {
        duration: FADE_IN_MS,
        easing: Easing.out(Easing.cubic),
      });
    };

    if (prevFocusRef.current === null) {
      prevFocusRef.current = safeIndex;
      swapTo(safeIndex);
      return;
    }

    if (prevFocusRef.current === safeIndex) return;
    prevFocusRef.current = safeIndex;

    opacity.value = withTiming(
      0,
      { duration: FADE_OUT_MS, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (!finished) return;
        runOnJS(swapTo)(safeIndex);
      },
    );
  }, [safeIndex, captionCount, opacity]);

  const animStyle = useAnimatedStyle(() => {
    const inv = 1 / Math.max(0.62, mapScale.value);
    return {
      opacity: opacity.value,
      transform: [{ scale: Math.min(1.08, inv) }],
    };
  });

  if (captionCount === 0 || !shown) return null;

  const a11y = `${shownTheme.emoji} ${shownTitle}${shownCountry ? `, ${shownCountry}` : ""}`;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityRole="text"
      accessibilityLabel={a11y}
      style={[
        styles.wrap,
        {
          left: centroid.x - maxWidth / 2,
          top: centroid.y - lineHeight * 2.2,
          width: maxWidth,
        },
        animStyle,
      ]}
    >
      <View style={styles.pill}>
        {shown.countryCode ? (
          <Text style={styles.flag} accessibilityElementsHidden>
            {flagFor(shown.countryCode)}
          </Text>
        ) : null}
        <Text style={styles.emoji} accessibilityElementsHidden>
          {shownTheme.emoji}
        </Text>
        <Text
          style={[
            styles.title,
            {
              fontSize,
              lineHeight,
            },
          ]}
        >
          {shownTitle}
        </Text>
      </View>
      {shownCountry ? (
        <Text style={styles.country} numberOfLines={1}>
          {shownCountry}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    alignItems: "center",
    zIndex: 12,
  },
  pill: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(0, 12, 24, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255, 180, 90, 0.28)",
  },
  flag: {
    fontSize: 14,
    lineHeight: 18,
  },
  emoji: {
    fontSize: 15,
    lineHeight: 18,
  },
  title: {
    flexShrink: 1,
    fontFamily: "Inter_600SemiBold",
    color: "#F8FAFC",
    textAlign: "center",
  },
  country: {
    marginTop: 4,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    lineHeight: 14,
    color: "rgba(232, 244, 248, 0.72)",
    textAlign: "center",
    maxWidth: "100%",
  },
});
