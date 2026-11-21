import { geoEqualEarth, geoPath } from "d3-geo";
import React, { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { G, Path } from "react-native-svg";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";

import { buildMapLines, lineAt, type MapLine, type Point } from "@/core/mapGeometry";
import type { Wave } from "@/core/types";
import { centroidLonLatForCountry } from "@/data/countryCentroids";
import { colors } from "@/theme";

const topology = land110 as unknown as Topology;
const land = feature(topology, topology.objects.land as GeometryCollection);

/** Width of the Equal Earth world divided by its height. */
const WORLD_ASPECT = 2.054;
/** How close a touch has to be to a line to open its Wave, in map units. */
const TOUCH_REACH = 24;

interface Props {
  waves: readonly Wave[];
  /** The map opens centred here. */
  homeCountry: string | null;
  onOpenWave: (waveId: string) => void;
}

/**
 * The keepsake map: the world, and one faint glowing line for each of the
 * user's own Waves. Nothing else is drawn. The world is taller than a phone
 * is wide, so it scrolls sideways.
 */
export function WorldMap({ waves, homeCountry, onOpenWave }: Props) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setBox((current) =>
      current && current.width === width && current.height === height ? current : { width, height },
    );
  };

  const map = useMemo(() => {
    if (!box) return null;
    const height = Math.max(220, Math.min(box.height, 560));
    const width = Math.max(box.width, Math.round(height * WORLD_ASPECT));
    const fittedHeight = Math.min(height, Math.round(width / WORLD_ASPECT));
    const projection = geoEqualEarth().fitSize([width, fittedHeight], { type: "Sphere" });
    const project = (code: string): Point | null => {
      const lonLat = centroidLonLatForCountry(code);
      if (!lonLat) return null;
      const xy = projection([lonLat[0], lonLat[1]] as [number, number]);
      return xy ? { x: xy[0], y: xy[1] } : null;
    };
    return {
      width,
      height: fittedHeight,
      landPath: geoPath(projection)(land) ?? "",
      project,
      loopSize: Math.max(18, fittedHeight * 0.07),
    };
  }, [box]);

  const lines = useMemo<MapLine[]>(() => {
    if (!map) return [];
    return buildMapLines(
      waves.map((wave) => ({
        id: wave.id,
        mine: wave.mine.countryCode,
        theirs: wave.theirs.countryCode,
      })),
      map.project,
      { loopSize: map.loopSize, fallbackCountry: homeCountry },
    );
  }, [map, waves, homeCountry]);

  // Open on the part of the world the user lives in.
  const startX = useMemo(() => {
    if (!map || !box) return 0;
    const home = homeCountry ? map.project(homeCountry) : null;
    const centre = home ? home.x : map.width / 2;
    return Math.max(0, Math.min(map.width - box.width, centre - box.width / 2));
  }, [map, box, homeCountry]);

  // contentOffset sets the first paint; keep a mark so later layout changes can re-centre.
  const [offsetX, setOffsetX] = useState(0);
  useEffect(() => {
    setOffsetX(startX);
  }, [startX]);

  const onTouch = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    const line = lineAt(lines, { x: locationX, y: locationY }, TOUCH_REACH);
    if (line) onOpenWave(line.waveId);
  };

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {map ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          contentOffset={{ x: offsetX, y: 0 }}
          contentContainerStyle={styles.content}
        >
          <Svg width={map.width} height={map.height}>
            <Path
              d={map.landPath}
              fill={colors.water}
              fillOpacity={0.09}
              stroke={colors.water}
              strokeOpacity={0.22}
              strokeWidth={0.6}
            />
            {lines.map((line) => (
              <G key={line.waveId}>
                <Path
                  d={line.d}
                  fill="none"
                  stroke={colors.water}
                  strokeOpacity={0.14}
                  strokeWidth={7}
                  strokeLinecap="round"
                />
                <Path
                  d={line.d}
                  fill="none"
                  stroke={colors.mist}
                  strokeOpacity={0.85}
                  strokeWidth={1.3}
                  strokeLinecap="round"
                />
              </G>
            ))}
          </Svg>
          {/* One touch layer over the whole map: the nearest line to the finger opens. */}
          <Pressable
            style={[styles.touch, { width: map.width, height: map.height }]}
            onPress={onTouch}
            accessibilityLabel="Your Waves on a map of the world"
          />
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignSelf: "stretch" },
  content: { alignItems: "center" },
  touch: { position: "absolute", left: 0 },
});
