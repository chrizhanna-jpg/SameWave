import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Path,
  Rect,
} from "react-native-svg";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  size?: number;
}

const CONNECTIONS = [
  // [x1, y1, x2, y2, cpx, cpy]
  [42, 52, 98, 32, 68, 8],       // New York → London
  [98, 32, 145, 62, 122, 22],    // London → Mumbai
  [145, 62, 168, 44, 158, 28],   // Mumbai → Tokyo
  [98, 32, 98, 90, 120, 62],     // London → Lagos
  [98, 90, 58, 118, 68, 118],    // Lagos → São Paulo
  [42, 52, 58, 118, 22, 88],     // New York → São Paulo
  [58, 118, 98, 90, 72, 80],     // São Paulo → Lagos (extra)
  [168, 44, 145, 62, 168, 70],   // Tokyo → Mumbai (return)
];

const DOTS = [
  { x: 42, y: 52, label: "NY" },
  { x: 98, y: 32, label: "LON" },
  { x: 98, y: 90, label: "LAG" },
  { x: 145, y: 62, label: "MUM" },
  { x: 168, y: 44, label: "TYO" },
  { x: 58, y: 118, label: "SAO" },
];

export function GlobeAnimation({ size = 200 }: Props) {
  const scale = size / 200;
  const [activeConn, setActiveConn] = useState(0);
  const connOpacities = useRef(
    CONNECTIONS.map(() => new Animated.Value(0))
  ).current;
  const dotPulses = useRef(DOTS.map(() => new Animated.Value(0))).current;
  const globePulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(globePulse, {
          toValue: 1.04,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(globePulse, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    dotPulses.forEach((p, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 300),
          Animated.timing(p, {
            toValue: 1,
            duration: 900,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(p, {
            toValue: 0,
            duration: 900,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    });
  }, []);

  useEffect(() => {
    const cycle = () => {
      const idx = activeConn % CONNECTIONS.length;
      Animated.sequence([
        Animated.timing(connOpacities[idx], {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.delay(800),
        Animated.timing(connOpacities[idx], {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setActiveConn((prev) => prev + 1);
      });
    };
    cycle();
  }, [activeConn]);

  return (
    <Animated.View
      style={[
        styles.container,
        { width: size, height: size, transform: [{ scale: globePulse }] },
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 200 200">
        <Defs>
          <ClipPath id="globeClip">
            <Circle cx="100" cy="100" r="92" />
          </ClipPath>
        </Defs>

        {/* Outer glow ring */}
        <Circle cx="100" cy="100" r="96" fill="none" stroke="#1a6fa8" strokeWidth="1" opacity="0.3" />
        <Circle cx="100" cy="100" r="99" fill="none" stroke="#1a6fa8" strokeWidth="0.5" opacity="0.15" />

        {/* Ocean background */}
        <Circle cx="100" cy="100" r="92" fill="#1565a0" />

        {/* Subtle latitude lines */}
        <G clipPath="url(#globeClip)" opacity="0.15">
          <Ellipse cx="100" cy="100" rx="92" ry="20" fill="none" stroke="#ffffff" strokeWidth="0.7" />
          <Ellipse cx="100" cy="100" rx="92" ry="50" fill="none" stroke="#ffffff" strokeWidth="0.5" />
          <Ellipse cx="100" cy="100" rx="92" ry="75" fill="none" stroke="#ffffff" strokeWidth="0.4" />
          {/* Meridian */}
          <Path d="M 100,8 Q 130,55 100,100 Q 70,145 100,192" fill="none" stroke="#ffffff" strokeWidth="0.5" />
          <Path d="M 100,8 Q 70,55 100,100 Q 130,145 100,192" fill="none" stroke="#ffffff" strokeWidth="0.5" />
        </G>

        {/* Continents — graphic style, flat color */}
        <G clipPath="url(#globeClip)">
          {/* North America */}
          <Path
            d="M 18,28 L 52,20 L 68,32 L 72,48 L 66,65 L 56,78 L 44,82 L 32,72 L 20,55 L 15,40 Z"
            fill="#2e7d32"
            opacity="0.95"
          />
          {/* Greenland */}
          <Path
            d="M 55,8 L 75,8 L 78,22 L 68,26 L 55,20 Z"
            fill="#388e3c"
            opacity="0.9"
          />
          {/* South America */}
          <Path
            d="M 44,88 L 68,82 L 76,98 L 74,120 L 68,140 L 55,152 L 40,144 L 32,128 L 34,108 Z"
            fill="#2e7d32"
            opacity="0.95"
          />
          {/* Europe */}
          <Path
            d="M 86,20 L 104,16 L 120,24 L 122,38 L 112,46 L 102,50 L 90,46 L 82,36 Z"
            fill="#388e3c"
            opacity="0.95"
          />
          {/* Africa */}
          <Path
            d="M 88,58 L 114,52 L 126,68 L 126,95 L 118,122 L 106,134 L 90,130 L 80,115 L 78,92 L 82,72 Z"
            fill="#2e7d32"
            opacity="0.95"
          />
          {/* Russia / North Asia */}
          <Path
            d="M 118,10 L 185,8 L 188,30 L 172,40 L 152,44 L 130,40 L 116,30 Z"
            fill="#388e3c"
            opacity="0.9"
          />
          {/* Central/South Asia */}
          <Path
            d="M 128,48 L 162,42 L 175,58 L 172,75 L 155,82 L 135,78 L 122,65 Z"
            fill="#2e7d32"
            opacity="0.95"
          />
          {/* Southeast Asia / Japan */}
          <Path
            d="M 162,45 L 182,40 L 188,56 L 180,65 L 168,62 Z"
            fill="#388e3c"
            opacity="0.85"
          />
          {/* Australia */}
          <Path
            d="M 148,118 L 182,112 L 188,132 L 184,150 L 165,155 L 145,145 L 140,130 Z"
            fill="#2e7d32"
            opacity="0.9"
          />
          {/* Antarctic hint */}
          <Path
            d="M 30,182 Q 100,175 170,182 L 190,195 L 10,195 Z"
            fill="#43a047"
            opacity="0.4"
          />
        </G>

        {/* Connection arcs */}
        <G clipPath="url(#globeClip)">
          {CONNECTIONS.map((conn, i) => {
            const [x1, y1, x2, y2, cpx, cpy] = conn;
            return (
              <AnimatedPath
                key={i}
                d={`M ${x1},${y1} Q ${cpx},${cpy} ${x2},${y2}`}
                fill="none"
                stroke="#FFD166"
                strokeWidth="1.8"
                strokeLinecap="round"
                opacity={connOpacities[i]}
              />
            );
          })}
        </G>

        {/* Connection dots */}
        {DOTS.map((dot, i) => (
          <G key={i}>
            <AnimatedCircle
              cx={dot.x}
              cy={dot.y}
              r={dotPulses[i].interpolate({
                inputRange: [0, 1],
                outputRange: [3.5, 6],
              })}
              fill="#FFD166"
              opacity={dotPulses[i].interpolate({
                inputRange: [0, 1],
                outputRange: [0.7, 1],
              })}
            />
            <Circle cx={dot.x} cy={dot.y} r={2.5} fill="#fff" opacity={0.95} />
          </G>
        ))}

        {/* Globe shine overlay */}
        <Circle
          cx="75"
          cy="65"
          r="30"
          fill="url(#shine)"
          opacity="0.06"
        />
        <Path
          d="M 60,30 Q 85,25 95,50 Q 75,52 55,45 Z"
          fill="#ffffff"
          opacity="0.08"
          clipPath="url(#globeClip)"
        />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
});
