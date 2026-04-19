import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path } from "react-native-svg";

const AnimatedView = Animated.View;

const OCEAN = "#1565a0";
const LAND = "#2e7d32";
const LAND_LIGHT = "#388e3c";
const GRID = "rgba(255,255,255,0.12)";
const DOT = "#FFD166";
const ARC = "#FFD166";
const SHINE = "rgba(255,255,255,0.09)";

// All continent paths in a 200x200 equirectangular tile.
// This tile repeats (second copy offset +200 on X) for seamless loop rotation.
const CONTINENT_PATHS = [
  // North America
  "M 15,25 L 55,18 L 68,30 L 72,50 L 65,68 L 55,80 L 40,85 L 28,75 L 18,58 L 12,40 Z",
  // Greenland
  "M 52,7 L 73,6 L 77,20 L 66,26 L 52,20 Z",
  // South America
  "M 42,90 L 65,85 L 74,100 L 72,122 L 66,142 L 53,155 L 38,146 L 30,128 L 32,108 Z",
  // Europe
  "M 86,22 L 107,16 L 121,26 L 119,40 L 109,48 L 94,46 L 82,36 Z",
  // Africa
  "M 88,56 L 113,50 L 128,65 L 129,92 L 121,122 L 106,136 L 90,132 L 80,116 L 79,90 L 82,72 Z",
  // Madagascar
  "M 118,104 L 126,103 L 125,124 L 117,120 Z",
  // Russia / N Asia
  "M 122,10 L 200,8 L 200,33 L 172,42 L 150,46 L 128,41 L 118,28 Z",
  // Central/South Asia
  "M 128,50 L 166,44 L 179,58 L 176,76 L 159,83 L 138,79 L 124,65 Z",
  // Japan/East
  "M 170,42 L 186,38 L 191,50 L 183,56 L 172,52 Z",
  // Southeast Asia islands
  "M 158,75 L 174,72 L 178,82 L 168,86 L 156,84 Z",
  // Australia
  "M 148,112 L 186,108 L 193,129 L 189,149 L 169,154 L 145,144 L 140,128 Z",
  // New Zealand
  "M 192,148 L 198,146 L 200,158 L 193,158 Z",
];

// Static dot positions on the globe face (shown on top layer, not moving)
const DOTS = [
  { x: 42, y: 52 },   // New York
  { x: 98, y: 32 },   // London
  { x: 98, y: 90 },   // Lagos
  { x: 145, y: 62 },  // Mumbai
  { x: 172, y: 44 },  // Tokyo
  { x: 58, y: 118 },  // São Paulo
];

// Connection arcs between dots (quadratic bezier: x1 y1 cpx cpy x2 y2)
const ARCS = [
  { d: "M 42,52 Q 68,8 98,32", delay: 0 },
  { d: "M 98,32 Q 122,22 145,62", delay: 700 },
  { d: "M 145,62 Q 160,28 172,44", delay: 1400 },
  { d: "M 98,32 Q 118,62 98,90", delay: 2100 },
  { d: "M 98,90 Q 72,80 58,118", delay: 2800 },
  { d: "M 42,52 Q 24,88 58,118", delay: 3500 },
];

interface Props {
  size?: number;
}

export function GlobeAnimation({ size = 200 }: Props) {
  const r = size / 2;

  // Rotation: translateX from 0 → -size, looping
  const rotation = useRef(new Animated.Value(0)).current;
  // Globe entrance scale
  const entrance = useRef(new Animated.Value(0.7)).current;
  const entranceOpacity = useRef(new Animated.Value(0)).current;
  // Arc opacities
  const arcOpacities = useRef(ARCS.map(() => new Animated.Value(0))).current;
  // Dot pulses
  const dotPulses = useRef(DOTS.map(() => new Animated.Value(1))).current;

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.spring(entrance, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(entranceOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    // Continuous rotation
    Animated.loop(
      Animated.timing(rotation, {
        toValue: -size,
        duration: 22000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Dot pulse
    dotPulses.forEach((p, i) => {
      const loop = () => {
        Animated.sequence([
          Animated.delay(i * 400),
          Animated.timing(p, {
            toValue: 1.6,
            duration: 700,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(p, {
            toValue: 1,
            duration: 700,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(1500),
        ]).start(({ finished }) => {
          if (finished) loop();
        });
      };
      loop();
    });

    // Arc fade animations cycling
    const cycleArcs = (idx: number) => {
      Animated.sequence([
        Animated.timing(arcOpacities[idx], {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.delay(1000),
        Animated.timing(arcOpacities[idx], {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.delay(ARCS.length * 600),
      ]).start(({ finished }) => {
        if (finished) cycleArcs(idx);
      });
    };
    ARCS.forEach((arc, i) => {
      setTimeout(() => cycleArcs(i), arc.delay);
    });
  }, []);

  // Seamless continental tile: two copies at x=0 and x=size, then rotate translateX 0→-size
  const tileContent = [0, size].map((offsetX) =>
    CONTINENT_PATHS.map((d, i) => {
      // Offset the path in X by parsing — easier to just use SVG transform
      return (
        <G key={`${offsetX}-${i}`} transform={`translate(${offsetX}, 0)`}>
          <Path
            d={d}
            fill={i % 3 === 0 ? LAND_LIGHT : LAND}
            opacity={0.97}
          />
        </G>
      );
    })
  );

  return (
    <AnimatedView
      style={[
        styles.outerWrapper,
        {
          width: size,
          height: size,
          opacity: entranceOpacity,
          transform: [{ scale: entrance }],
        },
      ]}
    >
      {/* Outer atmosphere glow */}
      <View
        style={[
          styles.atmosphere,
          {
            width: size + 16,
            height: size + 16,
            borderRadius: (size + 16) / 2,
            top: -8,
            left: -8,
          },
        ]}
      />

      {/* The globe — View-based clipping (avoids SVG clipPath native issues) */}
      <View
        style={[
          styles.globe,
          {
            width: size,
            height: size,
            borderRadius: r,
            backgroundColor: OCEAN,
          },
        ]}
      >
        {/* Grid lines — static SVG */}
        <Svg
          style={StyleSheet.absoluteFill}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          {/* Latitude lines */}
          <Ellipse cx={r} cy={r} rx={r - 2} ry={(r - 2) * 0.2} fill="none" stroke={GRID} strokeWidth="0.8" />
          <Ellipse cx={r} cy={r} rx={r - 2} ry={(r - 2) * 0.5} fill="none" stroke={GRID} strokeWidth="0.6" />
          <Ellipse cx={r} cy={r} rx={r - 2} ry={(r - 2) * 0.8} fill="none" stroke={GRID} strokeWidth="0.5" />
          {/* Meridians */}
          <Path
            d={`M ${r},2 Q ${r + (r * 0.4)},${r} ${r},${size - 2}`}
            fill="none" stroke={GRID} strokeWidth="0.6"
          />
          <Path
            d={`M ${r},2 Q ${r - (r * 0.4)},${r} ${r},${size - 2}`}
            fill="none" stroke={GRID} strokeWidth="0.6"
          />
        </Svg>

        {/* Rotating continent layer */}
        <AnimatedView
          style={[
            styles.continentLayer,
            { transform: [{ translateX: rotation }] },
          ]}
        >
          <Svg
            width={size * 2}
            height={size}
            viewBox={`0 0 ${size * 2} ${size}`}
          >
            {tileContent}
          </Svg>
        </AnimatedView>

        {/* Highlight shine */}
        <View
          style={[
            styles.shine,
            {
              width: size * 0.55,
              height: size * 0.45,
              borderRadius: size * 0.3,
              top: size * 0.06,
              left: size * 0.1,
              backgroundColor: SHINE,
            },
          ]}
        />
      </View>

      {/* Connection arcs + dots — fixed overlay SVG */}
      <Svg
        style={[StyleSheet.absoluteFill, { top: 0, left: 0 }]}
        width={size}
        height={size}
        viewBox="0 0 200 200"
      >
        {/* Arcs — individually animated via wrapper */}
        {ARCS.map((arc, i) => (
          // Can't use Animated directly on SVG Path opacity in all native versions,
          // so we render all arcs at low base opacity and pulse them via wrapper trick
          <Path
            key={i}
            d={arc.d}
            fill="none"
            stroke={ARC}
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity={0.15}
          />
        ))}
        {/* Dots */}
        {DOTS.map((dot, i) => (
          <G key={i}>
            <Circle cx={dot.x} cy={dot.y} r={4} fill={DOT} opacity={0.35} />
            <Circle cx={dot.x} cy={dot.y} r={2.5} fill={DOT} />
            <Circle cx={dot.x} cy={dot.y} r={1.5} fill="#fff" />
          </G>
        ))}
      </Svg>

      {/* Animated arc overlays using View/Animated (avoids SVG animation issues) */}
      {ARCS.map((arc, i) => (
        <AnimatedView
          key={`arc-anim-${i}`}
          style={[
            StyleSheet.absoluteFill,
            { opacity: arcOpacities[i] },
          ]}
          pointerEvents="none"
        >
          <Svg
            width={size}
            height={size}
            viewBox="0 0 200 200"
          >
            <Path
              d={arc.d}
              fill="none"
              stroke={ARC}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </Svg>
        </AnimatedView>
      ))}

      {/* Animated dot pulses */}
      {DOTS.map((dot, i) => (
        <AnimatedView
          key={`dot-${i}`}
          style={[
            styles.dotPulse,
            {
              left: (dot.x / 200) * size - 6,
              top: (dot.y / 200) * size - 6,
              transform: [{ scale: dotPulses[i] }],
            },
          ]}
          pointerEvents="none"
        />
      ))}
    </AnimatedView>
  );
}

const styles = StyleSheet.create({
  outerWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  atmosphere: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "rgba(2, 136, 209, 0.25)",
    shadowColor: "#0288D1",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  globe: {
    overflow: "hidden",
    position: "relative",
  },
  continentLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "200%",
    height: "100%",
  },
  shine: {
    position: "absolute",
  },
  dotPulse: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(255, 209, 102, 0.3)",
  },
});
