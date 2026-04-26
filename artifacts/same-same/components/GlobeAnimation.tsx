import React, { useEffect, useMemo, useRef } from "react";
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
  "M 15,25 L 55,18 L 68,30 L 72,50 L 65,68 L 55,80 L 40,85 L 28,75 L 18,58 L 12,40 Z",
  "M 52,7 L 73,6 L 77,20 L 66,26 L 52,20 Z",
  "M 42,90 L 65,85 L 74,100 L 72,122 L 66,142 L 53,155 L 38,146 L 30,128 L 32,108 Z",
  "M 86,22 L 107,16 L 121,26 L 119,40 L 109,48 L 94,46 L 82,36 Z",
  "M 88,56 L 113,50 L 128,65 L 129,92 L 121,122 L 106,136 L 90,132 L 80,116 L 79,90 L 82,72 Z",
  "M 118,104 L 126,103 L 125,124 L 117,120 Z",
  "M 122,10 L 200,8 L 200,33 L 172,42 L 150,46 L 128,41 L 118,28 Z",
  "M 128,50 L 166,44 L 179,58 L 176,76 L 159,83 L 138,79 L 124,65 Z",
  "M 170,42 L 186,38 L 191,50 L 183,56 L 172,52 Z",
  "M 158,75 L 174,72 L 178,82 L 168,86 L 156,84 Z",
  "M 148,112 L 186,108 L 193,129 L 189,149 L 169,154 L 145,144 L 140,128 Z",
  "M 192,148 L 198,146 L 200,158 L 193,158 Z",
];

// Static city dots
const DOTS = [
  { x: 42, y: 52 },
  { x: 98, y: 32 },
  { x: 98, y: 90 },
  { x: 145, y: 62 },
  { x: 172, y: 44 },
  { x: 58, y: 118 },
];

// Connection arcs (existing — between cities)
const ARCS = [
  { d: "M 42,52 Q 68,8 98,32", delay: 0 },
  { d: "M 98,32 Q 122,22 145,62", delay: 700 },
  { d: "M 145,62 Q 160,28 172,44", delay: 1400 },
  { d: "M 98,32 Q 118,62 98,90", delay: 2100 },
  { d: "M 98,90 Q 72,80 58,118", delay: 2800 },
  { d: "M 42,52 Q 24,88 58,118", delay: 3500 },
];

// Multi-colour wave ribbon flowing across the equator. Each band has its
// own colour, amplitude, period and animation duration so they layer up
// into a flowing, parallax-style wave (matching the SameWave brand mark).
const WAVE_BANDS = [
  { y: 86, color: "rgba(255,255,255,0.70)", strokeWidth: 2.4, period: 110, amp: 7, duration: 16000 },
  { y: 95, color: "rgba(180,222,250,0.92)", strokeWidth: 4.2, period: 120, amp: 9, duration: 13000 },
  { y: 104, color: "rgba(255,130,90,0.90)", strokeWidth: 5.0, period: 130, amp: 11, duration: 10500 },
  { y: 113, color: "rgba(126,195,240,0.88)", strokeWidth: 4.0, period: 115, amp: 10, duration: 12000 },
  { y: 122, color: "rgba(255,255,255,0.55)", strokeWidth: 2.4, period: 100, amp: 7, duration: 17500 },
];

// Twinkling sparkle positions (200x200 viewBox, around the globe).
const SPARKLES = [
  { x: 22, y: 30, size: 1.6, delay: 0 },
  { x: 178, y: 28, size: 1.4, delay: 350 },
  { x: 12, y: 100, size: 1.8, delay: 700 },
  { x: 190, y: 92, size: 1.4, delay: 1100 },
  { x: 28, y: 168, size: 1.6, delay: 1500 },
  { x: 174, y: 174, size: 1.5, delay: 1850 },
  { x: 60, y: 14, size: 1.2, delay: 2200 },
  { x: 138, y: 186, size: 1.4, delay: 2600 },
  { x: 6, y: 60, size: 1.3, delay: 3000 },
  { x: 194, y: 142, size: 1.6, delay: 3400 },
];

// Orbital connection rings precessing around the globe. Each is a thin
// tilted ellipse that slowly rotates around the globe centre, evoking
// satellites / signals circling the earth.
const ORBITS = [
  { rx: 96, ry: 30, color: "rgba(255,255,255,0.45)", strokeWidth: 1.0, duration: 18000, reverse: false },
  { rx: 92, ry: 64, color: "rgba(255,255,255,0.32)", strokeWidth: 0.9, duration: 24000, reverse: true },
  { rx: 96, ry: 16, color: "rgba(255,255,255,0.28)", strokeWidth: 0.7, duration: 30000, reverse: false },
];

interface Props {
  size?: number;
}

// Build a long sine-style path so we can translate it horizontally for a
// seamless flow loop. The path is wider than the visible viewBox; the
// overflow:hidden on the parent globe view (or the SVG's own clip) hides
// the offscreen portion.
function makeWavePath(y: number, amp: number, period: number, startX: number, endX: number) {
  let path = `M ${startX},${y}`;
  let x = startX;
  let direction = -1;
  while (x < endX) {
    const ctrlX = x + period / 4;
    const ctrlY = y + amp * direction;
    const endpointX = x + period / 2;
    if (x === startX) {
      path += ` Q ${ctrlX},${ctrlY} ${endpointX},${y}`;
    } else {
      path += ` T ${endpointX},${y}`;
    }
    x = endpointX;
    direction *= -1;
  }
  return path;
}

export function GlobeAnimation({ size = 200 }: Props) {
  const r = size / 2;

  const rotation = useRef(new Animated.Value(0)).current;
  const entrance = useRef(new Animated.Value(0.7)).current;
  const entranceOpacity = useRef(new Animated.Value(0)).current;
  const arcOpacities = useRef(ARCS.map(() => new Animated.Value(0))).current;
  const dotPulses = useRef(DOTS.map(() => new Animated.Value(1))).current;

  // Per-band horizontal flow drivers. We translate each band by its own
  // period so the loop point matches the wave shape and the flow is
  // perfectly seamless.
  const waveShifts = useRef(WAVE_BANDS.map(() => new Animated.Value(0))).current;
  const orbitRotations = useRef(ORBITS.map(() => new Animated.Value(0))).current;
  const sparkleOpacities = useRef(SPARKLES.map(() => new Animated.Value(0.3))).current;

  // Pre-compute the long wave paths (memoised — they only depend on the
  // band config, not on size).
  const wavePaths = useMemo(
    () =>
      WAVE_BANDS.map((band) =>
        // Path runs from -band.period to 200 + band.period so we can shift
        // by exactly one period and have it land on an identical phase.
        makeWavePath(band.y, band.amp, band.period, -band.period, 200 + band.period * 2),
      ),
    [],
  );

  useEffect(() => {
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

    Animated.loop(
      Animated.timing(rotation, {
        toValue: -size,
        duration: 22000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();

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

    // Wave bands: translate horizontally by exactly one period for a
    // perfectly seamless loop. The shift is in *viewBox units*; we scale
    // it to actual pixels in the transform interpolation below.
    waveShifts.forEach((shift, i) => {
      const band = WAVE_BANDS[i];
      shift.setValue(0);
      Animated.loop(
        Animated.timing(shift, {
          toValue: 1,
          duration: band.duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    });

    // Orbit precession: each ring slowly rotates around the globe centre.
    orbitRotations.forEach((rot, i) => {
      const orbit = ORBITS[i];
      rot.setValue(0);
      Animated.loop(
        Animated.timing(rot, {
          toValue: 1,
          duration: orbit.duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    });

    // Sparkles: each twinkles in/out with a staggered start.
    sparkleOpacities.forEach((op, i) => {
      const spark = SPARKLES[i];
      const loop = () => {
        Animated.sequence([
          Animated.timing(op, {
            toValue: 1,
            duration: 700,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(op, {
            toValue: 0.25,
            duration: 900,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(1200),
        ]).start(({ finished }) => {
          if (finished) loop();
        });
      };
      setTimeout(loop, spark.delay);
    });
  }, []);

  const tileContent = [0, size].map((offsetX) =>
    CONTINENT_PATHS.map((d, i) => (
      <G key={`${offsetX}-${i}`} transform={`translate(${offsetX}, 0)`}>
        <Path
          d={d}
          fill={i % 3 === 0 ? LAND_LIGHT : LAND}
          opacity={0.97}
        />
      </G>
    )),
  );

  // Convert viewBox-unit horizontal shifts to actual pixels.
  const vbToPx = size / 200;

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

      {/* The globe — clipped to a circle */}
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
        {/* Latitude / meridian grid */}
        <Svg
          style={StyleSheet.absoluteFill}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          <Ellipse cx={r} cy={r} rx={r - 2} ry={(r - 2) * 0.2} fill="none" stroke={GRID} strokeWidth="0.8" />
          <Ellipse cx={r} cy={r} rx={r - 2} ry={(r - 2) * 0.5} fill="none" stroke={GRID} strokeWidth="0.6" />
          <Ellipse cx={r} cy={r} rx={r - 2} ry={(r - 2) * 0.8} fill="none" stroke={GRID} strokeWidth="0.5" />
          <Path
            d={`M ${r},2 Q ${r + r * 0.4},${r} ${r},${size - 2}`}
            fill="none"
            stroke={GRID}
            strokeWidth="0.6"
          />
          <Path
            d={`M ${r},2 Q ${r - r * 0.4},${r} ${r},${size - 2}`}
            fill="none"
            stroke={GRID}
            strokeWidth="0.6"
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

        {/* Animated multi-colour wave ribbon — clipped to the globe by
            the overflow:hidden on this parent view. Each band flows at
            its own speed for a parallax effect. */}
        {WAVE_BANDS.map((band, i) => {
          const translateX = waveShifts[i].interpolate({
            inputRange: [0, 1],
            // Shift left by exactly one period so the wave loops
            // seamlessly. Scale viewBox→px.
            outputRange: [0, -band.period * vbToPx],
          });
          return (
            <AnimatedView
              key={`wave-${i}`}
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { transform: [{ translateX }] },
              ]}
            >
              <Svg
                width={size}
                height={size}
                viewBox="0 0 200 200"
              >
                <Path
                  d={wavePaths[i]}
                  fill="none"
                  stroke={band.color}
                  strokeWidth={band.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </AnimatedView>
          );
        })}

        {/* Highlight shine — sits on top of the waves so the globe still
            reads as a 3D sphere with a light source. */}
        <View
          pointerEvents="none"
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

      {/* Orbital connection rings — drawn outside the globe so they wrap
          around it. Each ring slowly rotates around the globe centre. */}
      {ORBITS.map((orbit, i) => {
        const rotateInterp = orbitRotations[i].interpolate({
          inputRange: [0, 1],
          outputRange: orbit.reverse ? ["0deg", "-360deg"] : ["0deg", "360deg"],
        });
        return (
          <AnimatedView
            key={`orbit-${i}`}
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { transform: [{ rotate: rotateInterp }] },
            ]}
          >
            <Svg
              width={size}
              height={size}
              viewBox="0 0 200 200"
            >
              <Ellipse
                cx={100}
                cy={100}
                rx={orbit.rx}
                ry={orbit.ry}
                fill="none"
                stroke={orbit.color}
                strokeWidth={orbit.strokeWidth}
              />
            </Svg>
          </AnimatedView>
        );
      })}

      {/* Twinkling sparkles around the globe */}
      {SPARKLES.map((spark, i) => (
        <AnimatedView
          key={`sparkle-${i}`}
          pointerEvents="none"
          style={[
            styles.sparkle,
            {
              left: (spark.x / 200) * size - spark.size,
              top: (spark.y / 200) * size - spark.size,
              width: spark.size * 2,
              height: spark.size * 2,
              borderRadius: spark.size,
              opacity: sparkleOpacities[i],
              shadowRadius: spark.size * 3,
            },
          ]}
        />
      ))}

      {/* Existing static overlay: city dots + faded base arcs */}
      <Svg
        style={[StyleSheet.absoluteFill, { top: 0, left: 0 }]}
        width={size}
        height={size}
        viewBox="0 0 200 200"
        pointerEvents="none"
      >
        {ARCS.map((arc, i) => (
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
        {DOTS.map((dot, i) => (
          <G key={i}>
            <Circle cx={dot.x} cy={dot.y} r={4} fill={DOT} opacity={0.35} />
            <Circle cx={dot.x} cy={dot.y} r={2.5} fill={DOT} />
            <Circle cx={dot.x} cy={dot.y} r={1.5} fill="#fff" />
          </G>
        ))}
      </Svg>

      {/* Animated arc highlight overlays */}
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

      {/* Animated city dot pulses */}
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
  sparkle: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
  },
});
