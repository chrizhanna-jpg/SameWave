import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  size?: number;
}

export function GlobeAnimation({ size = 80 }: Props) {
  const colors = useColors();
  const rotation = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const rings = [
    { opacity: 0.15, scale: 1.6 },
    { opacity: 0.1, scale: 2.0 },
    { opacity: 0.05, scale: 2.4 },
  ];

  return (
    <View style={[styles.container, { width: size * 3, height: size * 3 }]}>
      {rings.map((ring, i) => (
        <Animated.View
          key={i}
          style={[
            styles.ring,
            {
              width: size * ring.scale,
              height: size * ring.scale,
              borderRadius: (size * ring.scale) / 2,
              borderColor: colors.primary,
              opacity: ring.opacity,
              transform: [{ scale: pulse }],
            },
          ]}
        />
      ))}
      <Animated.View
        style={[
          styles.globe,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.teal,
            transform: [{ rotate: spin }, { scale: pulse }],
          },
        ]}
      >
        <View style={[styles.line, styles.equator, { borderColor: "rgba(255,255,255,0.3)" }]} />
        <View style={[styles.line, styles.meridian, { borderColor: "rgba(255,255,255,0.3)" }]} />
        <View style={[styles.line, styles.meridian2, { borderColor: "rgba(255,255,255,0.3)" }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    borderWidth: 1.5,
  },
  globe: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  line: {
    position: "absolute",
    borderWidth: 1,
  },
  equator: {
    width: "100%",
    top: "50%",
  },
  meridian: {
    width: 1,
    height: "100%",
    left: "33%",
  },
  meridian2: {
    width: 1,
    height: "100%",
    left: "66%",
  },
});
