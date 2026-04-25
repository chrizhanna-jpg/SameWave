import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, Path, G } from "react-native-svg";

type Props = {
  size?: number;
};

// High-contrast palette so the spinner is obviously "working" against
// the dark navy card it sits on. Previously the globe body (#1565a0)
// blended into colors.card (#0d2340), so only the thin yellow arcs
// signalled motion. The brighter OCEAN, more visible GRID, and the new
// outer RING give the wheel a clear boundary and visible rotation.
const OCEAN = "#0AA0E8";
const RING = "#00BFA5";
const GRID = "rgba(255,255,255,0.45)";
const ARC = "#FFD166";
const SHINE = "rgba(255,255,255,0.28)";

// Compact loading indicator: a tiny rotating globe ringed by yellow connection
// arcs and dots. Reusable for any waiting state (photo analysis, network calls,
// etc.). Default size is 28 — pair with text in a row.
export function LoadingGlobe({ size = 28 }: Props) {
  const rotation = useRef(new Animated.Value(0)).current;
  const counterRot = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 2800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
    // Slower counter-rotation for the inner globe surface so the two layers
    // visibly slide past each other.
    Animated.loop(
      Animated.timing(counterRot, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  }, []);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const counter = counterRot.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "-360deg"],
  });

  const r = size / 2;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {/* Globe body (blue ball with grid) — slowly counter-rotates */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ rotate: counter }] },
        ]}
      >
        <View
          style={[
            styles.ball,
            { width: size, height: size, borderRadius: r, backgroundColor: OCEAN },
          ]}
        >
          <Svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            style={StyleSheet.absoluteFill}
          >
            {/* Latitudes */}
            <Ellipse cx={50} cy={50} rx={48} ry={10} fill="none" stroke={GRID} strokeWidth={1} />
            <Ellipse cx={50} cy={50} rx={48} ry={26} fill="none" stroke={GRID} strokeWidth={0.8} />
            {/* Meridian */}
            <Path
              d="M 50,2 Q 70,50 50,98"
              fill="none"
              stroke={GRID}
              strokeWidth={1}
            />
            <Path
              d="M 50,2 Q 30,50 50,98"
              fill="none"
              stroke={GRID}
              strokeWidth={1}
            />
            {/* Subtle highlight */}
            <Circle cx={32} cy={30} r={14} fill={SHINE} />
          </Svg>
        </View>
      </Animated.View>

      {/* Static teal ring around the globe — gives the wheel a clear
          boundary against the dark card so it reads as a distinct,
          working element even at small sizes. Sits BELOW the spinning
          arcs so the orbiting yellow trail still pops above it. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Circle
            cx={50}
            cy={50}
            r={47}
            fill="none"
            stroke={RING}
            strokeWidth={2.5}
            opacity={0.9}
          />
        </Svg>
      </View>

      {/* Yellow connection arcs + dots — spin around the globe.
          Thicker stroke (3 vs 2) and brighter dots make the rotation
          obviously visible as motion rather than a static decoration. */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ rotate: spin }] },
        ]}
        pointerEvents="none"
      >
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <G>
            {/* Three orbiting dots at 120° apart, connected by arcs */}
            <Path
              d="M 50,8 A 42 42 0 0 1 86,71"
              fill="none"
              stroke={ARC}
              strokeWidth={3}
              strokeLinecap="round"
              opacity={1}
            />
            <Path
              d="M 86,71 A 42 42 0 0 1 14,71"
              fill="none"
              stroke={ARC}
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.65}
            />
            <Path
              d="M 14,71 A 42 42 0 0 1 50,8"
              fill="none"
              stroke={ARC}
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.32}
            />
            {/* Dots at the three vertices */}
            <Circle cx={50} cy={8} r={4} fill={ARC} />
            <Circle cx={50} cy={8} r={1.8} fill="#fff" />
            <Circle cx={86} cy={71} r={3.2} fill={ARC} opacity={0.9} />
            <Circle cx={14} cy={71} r={2.6} fill={ARC} opacity={0.65} />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  ball: {
    overflow: "hidden",
  },
});

export default LoadingGlobe;
