import React, { useEffect, useMemo } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { geoEqualEarth } from "d3-geo";

import { atlasLandGeoFeature, atlasLandPathD } from "@/utils/atlasWorldLand";

const BG = "#0A1F2E";
const LAND = "#1E4D5C";
const PULSE = "#00C9B1";

/** Decorative pulse. No labels, no country, no interaction. */
export function RippleTravellingMap({
  width,
  height,
  reduceMotion,
}: {
  width: number;
  height: number;
  reduceMotion: boolean;
}) {
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    progress.value = withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.quad) });
  }, [progress, reduceMotion]);

  const land = useMemo(() => {
    const projection = geoEqualEarth().fitExtent(
      [
        [12, 12],
        [width - 12, height - 12],
      ],
      atlasLandGeoFeature as never,
    );
    return { d: atlasLandPathD(projection), projection };
  }, [width, height]);

  const travel = useMemo(() => {
    const start = land.projection([-20, 20]);
    const end = land.projection([40, 35]);
    if (!start || !end) return { x1: 40, y1: height / 2, x2: width - 40, y2: height / 2 };
    return { x1: start[0], y1: start[1], x2: end[0], y2: end[1] };
  }, [height, land.projection, width]);

  const dotStyle = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      opacity: t < 0.08 || t > 0.92 ? 0 : 1,
      transform: [
        { translateX: travel.x1 + (travel.x2 - travel.x1) * t - 7 },
        { translateY: travel.y1 + (travel.y2 - travel.y1) * t - 7 },
      ],
    };
  });

  return (
    <View
      style={[styles.wrap, { width, height, backgroundColor: BG }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={width} height={height}>
        {land.d ? <Path d={land.d} fill={LAND} /> : null}
      </Svg>
      {reduceMotion ? (
        <View style={[styles.staticDot, { left: travel.x2 - 7, top: travel.y2 - 7 }]} />
      ) : (
        <Animated.View style={[styles.dot, dotStyle]}>
          <Svg width={14} height={14}>
            <Circle cx={7} cy={7} r={5} fill={PULSE} />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = React.useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setReduce(on);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden", borderRadius: 12 },
  dot: { position: "absolute", width: 14, height: 14 },
  staticDot: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: PULSE,
  },
});
