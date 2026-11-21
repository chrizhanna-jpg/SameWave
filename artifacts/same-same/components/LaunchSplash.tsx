import { Image } from "expo-image";
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { RippleRings } from "@/components/RippleRings";
import { playWaveSwoosh } from "@/device/sound";
import { colors } from "@/theme";

const ICON = require("../assets/images/icon.png") as number;

/** Native splash icon size — keep in sync with expo splash `contain` look. */
const ICON_SIZE = 200;
/** Rings radiate past the icon; same waterMid + spacing feel as Waiting/home. */
const RINGS_SIZE = 340;

interface Props {
  /** Play the launch wave swoosh once when this overlay appears. */
  playSound?: boolean;
  /** Fired once the overlay has laid out (safe moment to hide the native splash). */
  onLayoutReady?: () => void;
}

/**
 * In-app splash that matches the native splash (icon centred on #E9F6FF)
 * plus concentric RippleRings from the old loading / waiting animation.
 * Mount this first, then hide the native splash underneath so there is no jump.
 */
export function LaunchSplash({ playSound = true, onLayoutReady }: Props) {
  useEffect(() => {
    if (playSound) void playWaveSwoosh();
  }, [playSound]);

  return (
    <View
      style={styles.root}
      accessibilityLabel="SameWave"
      pointerEvents="none"
      onLayout={() => onLayoutReady?.()}
    >
      <View style={styles.stage}>
        <RippleRings size={RINGS_SIZE} rings={4} color={colors.waterMid} />
        <Image
          source={ICON}
          style={styles.icon}
          contentFit="contain"
          accessibilityLabel="SameWave"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  stage: {
    width: RINGS_SIZE,
    height: RINGS_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    position: "absolute",
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
});
