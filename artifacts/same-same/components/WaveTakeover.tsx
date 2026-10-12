import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { RemotePhotoImage } from "@/components/RemotePhotoImage";
import { useReduceMotion } from "@/components/RippleTravellingMap";
import { playWaveChime } from "@/utils/rippleSound";

const BG = "#0A1F2E";
const TEAL = "#00C9B1";

/**
 * Full-screen wave, then the two photos meet. Reduce Motion shows the
 * photos in place with no slide and no chime motion.
 */
export function WaveTakeover({
  myPhoto,
  theirPhoto,
  onFinished,
}: {
  myPhoto: string;
  theirPhoto: string;
  onFinished: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const reduce = useReduceMotion();
  const rise = useSharedValue(reduce ? 1 : 0);
  const slide = useSharedValue(reduce ? 1 : 0);
  const rings = useSharedValue(reduce ? 1 : 0);
  const [phase, setPhase] = useState<"wave" | "photos">(reduce ? "photos" : "wave");
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  useEffect(() => {
    if (reduce) {
      const t = setTimeout(() => finishedRef.current(), 900);
      return () => clearTimeout(t);
    }
    rise.value = withTiming(1, { duration: 2400, easing: Easing.out(Easing.cubic) });
    const toPhotos = setTimeout(() => {
      setPhase("photos");
      slide.value = withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.cubic) });
      rings.value = withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) });
      void playWaveChime();
    }, 2400);
    const done = setTimeout(() => finishedRef.current(), 2400 + 1700);
    return () => {
      clearTimeout(toPhotos);
      clearTimeout(done);
    };
  }, [reduce, rings, rise, slide]);

  const waveStyle = useAnimatedStyle(() => ({
    height: rise.value * height,
  }));
  const leftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - slide.value) * -width * 0.55 }],
  }));
  const rightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - slide.value) * width * 0.55 }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 1 - rings.value * 0.15,
    transform: [{ scale: 0.4 + rings.value * 1.6 }],
  }));

  const photoW = Math.min(150, width * 0.38);

  return (
    <View style={styles.fill} accessibilityViewIsModal>
      <View style={[styles.fill, { backgroundColor: BG }]} />
      {phase === "wave" ? <Animated.View style={[styles.wave, waveStyle]} /> : null}
      {phase === "photos" ? (
        <View style={styles.meet}>
          <Animated.View style={[styles.ring, ringStyle]} />
          <Animated.View style={leftStyle}>
            <RemotePhotoImage uri={myPhoto} style={{ width: photoW, height: photoW * 1.25, borderRadius: 12 }} />
          </Animated.View>
          <Animated.View style={rightStyle}>
            <RemotePhotoImage uri={theirPhoto} style={{ width: photoW, height: photoW * 1.25, borderRadius: 12 }} />
          </Animated.View>
          <Text style={styles.caption}>A Wave</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BG,
  },
  wave: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: TEAL,
    opacity: 0.85,
    shadowColor: TEAL,
    shadowOpacity: 0.8,
    shadowRadius: 24,
  },
  meet: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 16,
  },
  ring: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: TEAL,
  },
  caption: {
    position: "absolute",
    bottom: 72,
    color: "#F0F8FF",
    fontSize: 22,
    fontFamily: "Inter_600SemiBold",
  },
});
