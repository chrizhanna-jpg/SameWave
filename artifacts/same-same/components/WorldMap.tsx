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
import Svg, { Circle, G, Path } from "react-native-svg";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";

import {
  buildMapGeometry,
  buildMapMarkers,
  lineAt,
  markerAt,
  type MapLine,
  type MapMarker,
  type Point,
} from "@/core/mapGeometry";
import type { Wave } from "@/core/types";
import { centroidLonLatForCountry } from "@/data/countryCentroids";
import { useReducedMotion } from "@/device/motion";
import { colors, motion } from "@/theme";

const topology = land110 as unknown as Topology;
const land = feature(topology, topology.objects.land as GeometryCollection);

/** Width of the Equal Earth world divided by its height. */
const WORLD_ASPECT = 2.054;
/** How close a touch has to be to a line to open its Wave, in map units. */
const LINE_TOUCH_REACH = 32;
/** Hit radius for photo endpoint markers (generous for fingers). */
const MARKER_TOUCH_REACH = 28;
/** Invisible mid-path hit target radius (platforms where polyline press is flaky). */
const MIDPOINT_HIT = 22;

interface Props {
  waves: readonly Wave[];
  /** The map opens centred here. */
  homeCountry: string | null;
  /** Waves whose threads should draw themselves like a travelling ripple. */
  drawingIds?: readonly string[];
  /** Line or mid-path tap → paired Wave view. */
  onOpenWave: (waveId: string) => void;
  /** Current (mine) photo marker tap → full-screen / detail. */
  onOpenPhoto: (waveId: string, photoId: string) => void;
}

/**
 * Keepsake map: muted land, one soft glowing thread per Wave between the
 * two photos' locations, and a tappable marker on the user's photo.
 */
export function WorldMap({
  waves,
  homeCountry,
  drawingIds = [],
  onOpenWave,
  onOpenPhoto,
}: Props) {
  const reduced = useReducedMotion();
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
    const projectLonLat = (lonLat: [number, number]): Point | null => {
      const xy = projection([lonLat[0], lonLat[1]]);
      return xy ? { x: xy[0], y: xy[1] } : null;
    };
    return {
      width,
      height: fittedHeight,
      landPath: geoPath(projection)(land) ?? "",
      project,
      projectLonLat,
      loopSize: Math.max(22, fittedHeight * 0.08),
    };
  }, [box]);

  const geometry = useMemo(() => {
    if (!map) return { lines: [] as MapLine[], markers: [] as MapMarker[] };
    const opts = { loopSize: map.loopSize, fallbackCountry: homeCountry };
    const inputs = waves.map((wave) => ({
      id: wave.id,
      mine: wave.mine.countryCode,
      theirs: wave.theirs.countryCode,
      mineLonLat:
        wave.mine.lng != null && wave.mine.lat != null
          ? ([wave.mine.lng, wave.mine.lat] as [number, number])
          : null,
      theirsLonLat:
        wave.theirs.lng != null && wave.theirs.lat != null
          ? ([wave.theirs.lng, wave.theirs.lat] as [number, number])
          : null,
    }));
    const { lines } = buildMapGeometry(inputs, map.project, opts, map.projectLonLat);
    const markers = buildMapMarkers(waves, map.project, opts, map.projectLonLat).filter(
      (m) => m.side === "mine",
    );
    return { lines, markers };
  }, [map, waves, homeCountry]);

  const startX = useMemo(() => {
    if (!map || !box) return 0;
    const home = homeCountry ? map.project(homeCountry) : null;
    const centre = home ? home.x : map.width / 2;
    return Math.max(0, Math.min(map.width - box.width, centre - box.width / 2));
  }, [map, box, homeCountry]);

  const [offsetX, setOffsetX] = useState(0);
  useEffect(() => {
    setOffsetX(startX);
  }, [startX]);

  const onTouch = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    const point = { x: locationX, y: locationY };
    // Photo markers win over lines so a tap on the pin opens the photo.
    const marker = markerAt(geometry.markers, point, MARKER_TOUCH_REACH);
    if (marker) {
      onOpenPhoto(marker.waveId, marker.photoId);
      return;
    }
    const line = lineAt(geometry.lines, point, LINE_TOUCH_REACH);
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
              fill={colors.waterSoft}
              fillOpacity={0.42}
              stroke={colors.waterMuted}
              strokeOpacity={0.2}
              strokeWidth={0.5}
            />
            {geometry.lines.map((line) => (
              <Thread
                key={line.waveId}
                line={line}
                draw={!reduced && drawingIds.includes(line.waveId)}
                reduced={reduced}
              />
            ))}
            {geometry.markers.map((marker) => (
              <PhotoMarker key={`${marker.waveId}-mine`} marker={marker} />
            ))}
          </Svg>
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

function PhotoMarker({ marker }: { marker: MapMarker }) {
  return (
    <G>
      {/* Invisible generous hit disc (drawn under the visible pin). */}
      <Circle
        cx={marker.point.x}
        cy={marker.point.y}
        r={MARKER_TOUCH_REACH}
        fill={colors.waterMid}
        fillOpacity={0.001}
      />
      <Circle
        cx={marker.point.x}
        cy={marker.point.y}
        r={7}
        fill={colors.white}
        fillOpacity={0.95}
        stroke={colors.waterMid}
        strokeWidth={2}
      />
      <Circle cx={marker.point.x} cy={marker.point.y} r={2.5} fill={colors.waterMid} />
    </G>
  );
}

function Thread({
  line,
  draw,
  reduced,
}: {
  line: MapLine;
  draw: boolean;
  reduced: boolean;
}) {
  const length = useMemo(() => pathLength(line.points), [line.points]);
  const [offset, setOffset] = useState(draw && !reduced ? length : 0);

  useEffect(() => {
    if (!draw || reduced) {
      setOffset(0);
      return;
    }
    setOffset(length);
    const started = Date.now();
    const duration = motion.reveal * 2.2;
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setOffset(length * (1 - eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draw, reduced, length, line.waveId]);

  const dashProps =
    draw && offset > 0.5
      ? { strokeDasharray: `${length}`, strokeDashoffset: offset }
      : {};

  return (
    <G>
      {/* Wide invisible stroke + tip disc for reliable taps. */}
      <Path
        d={line.d}
        fill="none"
        stroke={colors.waterMid}
        strokeOpacity={0.001}
        strokeWidth={LINE_TOUCH_REACH}
        strokeLinecap="round"
      />
      <Circle
        cx={line.tip.x}
        cy={line.tip.y}
        r={MIDPOINT_HIT}
        fill={colors.waterMid}
        fillOpacity={0.001}
      />
      <Path
        d={line.d}
        fill="none"
        stroke={colors.white}
        strokeOpacity={0.55}
        strokeWidth={6}
        strokeLinecap="round"
        {...dashProps}
      />
      <Path
        d={line.d}
        fill="none"
        stroke={colors.waterPale}
        strokeOpacity={0.85}
        strokeWidth={2.2}
        strokeLinecap="round"
        {...dashProps}
      />
      <Path
        d={line.d}
        fill="none"
        stroke={colors.waterMid}
        strokeOpacity={0.7}
        strokeWidth={1.1}
        strokeLinecap="round"
        {...dashProps}
      />
    </G>
  );
}

function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return Math.max(total, 1);
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignSelf: "stretch", backgroundColor: colors.background },
  content: { alignItems: "center" },
  touch: { position: "absolute", left: 0 },
});
