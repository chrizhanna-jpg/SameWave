import { geoEqualEarth, geoPath } from "d3-geo";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import {
  GestureHandlerRootView,
  PanGestureHandler,
  PinchGestureHandler,
  State,
  TapGestureHandler,
  type HandlerStateChangeEvent,
  type PanGestureHandlerEventPayload,
  type PanGestureHandlerGestureEvent,
  type PinchGestureHandlerEventPayload,
  type PinchGestureHandlerGestureEvent,
  type TapGestureHandlerEventPayload,
} from "react-native-gesture-handler";
import Svg, { Circle, G, Path } from "react-native-svg";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";

import {
  buildMapGeometry,
  buildMapMarkers,
  focusBounds,
  frameTransform,
  lineAt,
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
/** How close a touch has to be to a line (map units) — scaled by view. */
const LINE_TOUCH_SCREEN = 18;
/** Finger hit radius for pins in screen pixels (visual pin is smaller). */
const MARKER_TOUCH_SCREEN = 14;
/** Invisible mid-path hit target in screen pixels. */
const MIDPOINT_HIT_SCREEN = 14;
/** Visual pin — half the old r=7, constant on screen while the map zooms. */
const PIN_OUTER_R = 3.5;
const PIN_CORE_R = 1.25;
const PIN_STROKE = 1;
/** Keep fanned pin centres at least this many screen px apart. */
const FAN_SCREEN_PX = 22;

const MIN_SCALE = 1;
const MAX_SCALE = 5;

interface Props {
  waves: readonly Wave[];
  /** The map opens centred here when there are no wave pins yet. */
  homeCountry: string | null;
  /** Waves whose threads should draw themselves like a travelling ripple. */
  drawingIds?: readonly string[];
  /** Line or mid-path tap → paired Wave view. */
  onOpenWave: (waveId: string) => void;
  /** Current (mine) photo marker tap → full-screen / detail. */
  onOpenPhoto: (waveId: string, photoId: string) => void;
}

/**
 * Keepsake map: fills the tab, frames the first view on wave pins, pinch-zoom
 * and pan via react-native-gesture-handler (no react-native-maps).
 * Pins stay a constant on-screen size and fan so none hides another.
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
    // World canvas is at least as tall as the tab and wide enough for Equal Earth.
    const height = Math.max(box.height, 220);
    const width = Math.max(box.width, Math.round(height * WORLD_ASPECT));
    const fittedHeight = Math.max(box.height, Math.round(width / WORLD_ASPECT));
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

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const pinchScale0 = useRef(1);
  const pan0 = useRef({ x: 0, y: 0 });
  const live = useRef({ scale: 1, x: 0, y: 0 });
  const framedFor = useRef<string>("");
  /** Screen-space view used for pin overlay + fan (synced from gestures). */
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });

  const publishView = useCallback((next: { scale: number; x: number; y: number }) => {
    live.current = next;
    scale.setValue(next.scale);
    translateX.setValue(next.x);
    translateY.setValue(next.y);
    setView(next);
  }, [scale, translateX, translateY]);

  // Quantise scale so fan/lines rebuild ~10× per zoom step, not every pan frame.
  const fanScale = Math.round(view.scale * 10) / 10;

  const geometry = useMemo(() => {
    if (!map) return { lines: [] as MapLine[], markers: [] as MapMarker[] };
    const opts = {
      loopSize: map.loopSize,
      fallbackCountry: homeCountry,
      viewScale: fanScale,
      fanScreenPx: FAN_SCREEN_PX,
    };
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
    const markers = buildMapMarkers(waves, map.project, opts, map.projectLonLat);
    return { lines, markers };
  }, [map, waves, homeCountry, fanScale]);

  const clampPan = useCallback(
    (s: number, x: number, y: number) => {
      if (!map || !box) return { x, y };
      const worldW = map.width * s;
      const worldH = map.height * s;
      const loX = worldW <= box.width ? (box.width - worldW) / 2 : box.width - worldW;
      const hiX = worldW <= box.width ? (box.width - worldW) / 2 : 0;
      const loY = worldH <= box.height ? (box.height - worldH) / 2 : box.height - worldH;
      const hiY = worldH <= box.height ? (box.height - worldH) / 2 : 0;
      return {
        x: Math.min(Math.max(x, Math.min(loX, hiX)), Math.max(loX, hiX)),
        y: Math.min(Math.max(y, Math.min(loY, hiY)), Math.max(loY, hiY)),
      };
    },
    [map, box],
  );

  // Frame the first view on wave pins (or home country) so the tab has no dead band.
  useEffect(() => {
    if (!map || !box) return;
    const key = `${map.width}x${map.height}:${waves.map((w) => w.id).sort().join(",")}`;
    if (framedFor.current === key) return;
    framedFor.current = key;

    // Seed fan at a mid zoom so the first layout is already readable.
    const seedScale = 2.5;
    const seedOpts = {
      loopSize: map.loopSize,
      fallbackCountry: homeCountry,
      viewScale: seedScale,
      fanScreenPx: FAN_SCREEN_PX,
    };
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
    const seeded = buildMapGeometry(inputs, map.project, seedOpts, map.projectLonLat);
    const home = homeCountry ? map.project(homeCountry) : null;
    const pinPoints = seeded.markers.map((m) => m.point);
    const lineTips = seeded.lines.map((l) => l.tip);
    const bounds = focusBounds([...pinPoints, ...lineTips], home);
    let next: { scale: number; x: number; y: number };
    if (bounds) {
      next = frameTransform(bounds, box, {
        padding: 48,
        minScale: MIN_SCALE,
        maxScale: MAX_SCALE,
      });
    } else {
      const centreX = home ? home.x : map.width / 2;
      const centreY = home ? home.y : map.height / 2;
      next = {
        scale: 2.2,
        x: box.width / 2 - centreX * 2.2,
        y: box.height / 2 - centreY * 2.2,
      };
    }
    const clamped = clampPan(next.scale, next.x, next.y);
    publishView({ scale: next.scale, x: clamped.x, y: clamped.y });
  }, [map, box, waves, homeCountry, clampPan, publishView]);

  const onPinchGestureEvent = useCallback(
    (event: PinchGestureHandlerGestureEvent) => {
      const next = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, pinchScale0.current * event.nativeEvent.scale),
      );
      const pan = clampPan(next, live.current.x, live.current.y);
      publishView({ scale: next, x: pan.x, y: pan.y });
    },
    [clampPan, publishView],
  );

  const onPinchStateChange = useCallback(
    (event: HandlerStateChangeEvent<PinchGestureHandlerEventPayload>) => {
      if (event.nativeEvent.state === State.BEGAN) {
        pinchScale0.current = live.current.scale;
      }
    },
    [],
  );

  const onPanGestureEvent = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      const next = clampPan(
        live.current.scale,
        pan0.current.x + event.nativeEvent.translationX,
        pan0.current.y + event.nativeEvent.translationY,
      );
      publishView({ scale: live.current.scale, x: next.x, y: next.y });
    },
    [clampPan, publishView],
  );

  const onPanStateChange = useCallback(
    (event: HandlerStateChangeEvent<PanGestureHandlerEventPayload>) => {
      if (event.nativeEvent.state === State.BEGAN) {
        pan0.current = { x: live.current.x, y: live.current.y };
      }
    },
    [],
  );

  const onMapPress = useCallback(
    (screenX: number, screenY: number) => {
      const s = live.current.scale || 1;
      // Pins are hit in screen space (constant size overlay).
      for (const marker of geometry.markers) {
        const sx = marker.point.x * s + live.current.x;
        const sy = marker.point.y * s + live.current.y;
        if (Math.hypot(sx - screenX, sy - screenY) <= MARKER_TOUCH_SCREEN) {
          onOpenPhoto(marker.waveId, marker.photoId);
          return;
        }
      }
      const mapPoint = {
        x: (screenX - live.current.x) / s,
        y: (screenY - live.current.y) / s,
      };
      const lineReach = LINE_TOUCH_SCREEN / s;
      const line = lineAt(geometry.lines, mapPoint, lineReach);
      if (line) onOpenWave(line.waveId);
    },
    [geometry.lines, geometry.markers, onOpenPhoto, onOpenWave],
  );

  return (
    <GestureHandlerRootView style={styles.fill} onLayout={onLayout}>
      {map && box ? (
        <PinchGestureHandler onGestureEvent={onPinchGestureEvent} onHandlerStateChange={onPinchStateChange}>
          <Animated.View style={styles.fill}>
            <PanGestureHandler
              onGestureEvent={onPanGestureEvent}
              onHandlerStateChange={onPanStateChange}
              minPointers={1}
              maxPointers={1}
              avgTouches
              minDist={8}
            >
              <Animated.View style={styles.fill}>
                <TapGestureHandler
                  onHandlerStateChange={(
                    event: HandlerStateChangeEvent<TapGestureHandlerEventPayload>,
                  ) => {
                    if (event.nativeEvent.state !== State.END) return;
                    onMapPress(event.nativeEvent.x, event.nativeEvent.y);
                  }}
                >
                  <Animated.View style={styles.fill}>
                    <Animated.View
                      style={[
                        styles.stage,
                        {
                          width: map.width,
                          height: map.height,
                          transformOrigin: "0 0",
                          transform: [{ translateX }, { translateY }, { scale }],
                        },
                      ]}
                      pointerEvents="none"
                    >
                      <Svg width={map.width} height={map.height}>
                        <Path
                          d={map.landPath}
                          fill={colors.waterMuted}
                          fillOpacity={0.55}
                          stroke={colors.slate}
                          strokeOpacity={0.28}
                          strokeWidth={1.1}
                        />
                        {geometry.lines.map((line) => (
                          <Thread
                            key={line.waveId}
                            line={line}
                            draw={!reduced && drawingIds.includes(line.waveId)}
                            reduced={reduced}
                            viewScale={view.scale}
                          />
                        ))}
                      </Svg>
                    </Animated.View>

                    {/* Pins live in screen space so they stay a constant size. */}
                    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                      {geometry.markers.map((marker) => {
                        const left =
                          marker.point.x * view.scale + view.x - PIN_OUTER_R - PIN_STROKE;
                        const top =
                          marker.point.y * view.scale + view.y - PIN_OUTER_R - PIN_STROKE;
                        return (
                          <PhotoPin
                            key={`${marker.waveId}-${marker.side}-${marker.photoId}`}
                            left={left}
                            top={top}
                          />
                        );
                      })}
                    </View>
                  </Animated.View>
                </TapGestureHandler>
              </Animated.View>
            </PanGestureHandler>
          </Animated.View>
        </PinchGestureHandler>
      ) : null}
    </GestureHandlerRootView>
  );
}

function PhotoPin({ left, top }: { left: number; top: number }) {
  const size = (PIN_OUTER_R + PIN_STROKE) * 2;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.pin,
        {
          left,
          top,
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: PIN_STROKE,
        },
      ]}
    >
      <View
        style={{
          width: PIN_CORE_R * 2,
          height: PIN_CORE_R * 2,
          borderRadius: PIN_CORE_R,
          backgroundColor: colors.waterMid,
        }}
      />
    </View>
  );
}

function Thread({
  line,
  draw,
  reduced,
  viewScale,
}: {
  line: MapLine;
  draw: boolean;
  reduced: boolean;
  viewScale: number;
}) {
  const length = useMemo(() => pathLength(line.points), [line.points]);
  const [offset, setOffset] = useState(draw && !reduced ? length : 0);
  const midHit = MIDPOINT_HIT_SCREEN / Math.max(viewScale, 0.05);
  const touchW = LINE_TOUCH_SCREEN / Math.max(viewScale, 0.05);

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
      <Path
        d={line.d}
        fill="none"
        stroke={colors.waterMid}
        strokeOpacity={0.001}
        strokeWidth={touchW}
        strokeLinecap="round"
      />
      <Circle
        cx={line.tip.x}
        cy={line.tip.y}
        r={midHit}
        fill={colors.waterMid}
        fillOpacity={0.001}
      />
      <Path
        d={line.d}
        fill="none"
        stroke={colors.waterMid}
        strokeOpacity={0.78}
        strokeWidth={2 / Math.max(viewScale, 0.05)}
        strokeLinecap="round"
        strokeLinejoin="round"
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
  fill: { flex: 1, alignSelf: "stretch", backgroundColor: colors.background, overflow: "hidden" },
  stage: {},
  pin: {
    position: "absolute",
    backgroundColor: colors.white,
    borderColor: colors.waterMid,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.95,
  },
});
