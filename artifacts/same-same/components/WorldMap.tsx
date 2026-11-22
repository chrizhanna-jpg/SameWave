import { geoEqualEarth, geoPath } from "d3-geo";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
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
  buildClusteredView,
  CLUSTER_SCREEN_PX,
  focusBounds,
  frameTransform,
  lineAt,
  type MapCluster,
  type MapLine,
  type Point,
} from "@/core/mapGeometry";
import type { Wave } from "@/core/types";
import { centroidLonLatForCountry } from "@/data/countryCentroids";
import { useReducedMotion } from "@/device/motion";
import { colors, motion, type as typeStyle } from "@/theme";

const topology = land110 as unknown as Topology;
const land = feature(topology, topology.objects.land as GeometryCollection);

/** Width of the Equal Earth world divided by its height. */
const WORLD_ASPECT = 2.054;
/** How close a touch has to be to a line (screen px). */
const LINE_TOUCH_SCREEN = 18;
/** Minimum pin hit target (screen px diameter → radius). */
const MARKER_HIT_R = CLUSTER_SCREEN_PX / 2;
/** Invisible mid-path hit target in screen pixels. */
const MIDPOINT_HIT_SCREEN = 14;
/** Visual pin — screen-fixed, smaller than the 44px hit area. */
const PIN_OUTER_R = 5;
const PIN_CORE_R = 1.75;
const PIN_STROKE = 1.25;
const BADGE_R = 7;

const MIN_SCALE = 1;
const MAX_SCALE = 12;

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
 * and pan. Pins stay screen-fixed; overlapping ones merge into a count badge
 * at their true geographic spot and split apart as you zoom in.
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
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });

  const publishView = useCallback(
    (next: { scale: number; x: number; y: number }) => {
      live.current = next;
      scale.setValue(next.scale);
      translateX.setValue(next.x);
      translateY.setValue(next.y);
      setView(next);
    },
    [scale, translateX, translateY],
  );

  const waveInputs = useMemo(
    () =>
      waves.map((wave) => ({
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
      })),
    [waves],
  );

  // Quantise scale so clusters rebuild ~10× per zoom step, not every pan frame.
  const clusterScale = Math.round(view.scale * 10) / 10;

  const geometry = useMemo(() => {
    if (!map) return { lines: [] as MapLine[], clusters: [] as MapCluster[] };
    const opts = {
      loopSize: map.loopSize,
      fallbackCountry: homeCountry,
      viewScale: clusterScale,
      clusterScreenPx: CLUSTER_SCREEN_PX,
    };
    const clustered = buildClusteredView(waveInputs, map.project, opts, map.projectLonLat);
    // Restore real photo ids on single-member clusters.
    const clusters = clustered.clusters.map((c) => {
      if (c.count !== 1) return c;
      const m = c.members[0]!;
      const wave = waves.find((w) => w.id === m.waveId);
      if (!wave) return c;
      const photoId = m.side === "mine" ? wave.mine.photoId : wave.theirs.photoId;
      return {
        ...c,
        members: [{ ...m, photoId }],
      };
    });
    return { lines: clustered.lines, clusters };
  }, [map, waveInputs, homeCountry, clusterScale, waves]);

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

  const zoomToBounds = useCallback(
    (points: readonly Point[], minScaleBump = 1.35) => {
      if (!map || !box || points.length === 0) return;
      const bounds = focusBounds([...points], points[0] ?? null, 1) ?? {
        minX: points[0]!.x - 20,
        minY: points[0]!.y - 20,
        maxX: points[0]!.x + 20,
        maxY: points[0]!.y + 20,
      };
      const next = frameTransform(bounds, box, {
        padding: 56,
        minScale: Math.min(MAX_SCALE, Math.max(live.current.scale * minScaleBump, MIN_SCALE)),
        maxScale: MAX_SCALE,
      });
      const clamped = clampPan(next.scale, next.x, next.y);
      publishView({ scale: next.scale, x: clamped.x, y: clamped.y });
    },
    [map, box, clampPan, publishView],
  );

  // Frame the first view on the local wave cluster (Europe when home is GB).
  useEffect(() => {
    if (!map || !box) return;
    const key = `${map.width}x${map.height}:${waves.map((w) => w.id).sort().join(",")}`;
    if (framedFor.current === key) return;
    framedFor.current = key;

    const seed = buildClusteredView(
      waveInputs,
      map.project,
      {
        loopSize: map.loopSize,
        fallbackCountry: homeCountry,
        viewScale: 2.5,
        clusterScreenPx: CLUSTER_SCREEN_PX,
      },
      map.projectLonLat,
    );
    const home = homeCountry ? map.project(homeCountry) : null;
    const pinPoints = seed.clusters.map((c) => c.point);
    const lineTips = seed.lines.map((l) => l.tip);
    const bounds = focusBounds([...pinPoints, ...lineTips], home);
    let next: { scale: number; x: number; y: number };
    if (bounds) {
      next = frameTransform(bounds, box, {
        padding: 48,
        minScale: MIN_SCALE,
        maxScale: 5,
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
  }, [map, box, waves, waveInputs, homeCountry, clampPan, publishView]);

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
      for (const cluster of geometry.clusters) {
        const sx = cluster.point.x * s + live.current.x;
        const sy = cluster.point.y * s + live.current.y;
        if (Math.hypot(sx - screenX, sy - screenY) > MARKER_HIT_R) continue;
        if (cluster.count > 1) {
          zoomToBounds(cluster.members.map((m) => m.point));
          return;
        }
        const only = cluster.members[0]!;
        onOpenPhoto(only.waveId, only.photoId);
        return;
      }
      const mapPoint = {
        x: (screenX - live.current.x) / s,
        y: (screenY - live.current.y) / s,
      };
      const line = lineAt(geometry.lines, mapPoint, LINE_TOUCH_SCREEN / s);
      if (line) onOpenWave(line.waveId);
    },
    [geometry.lines, geometry.clusters, onOpenPhoto, onOpenWave, zoomToBounds],
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

                    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                      {geometry.clusters.map((cluster) => {
                        const left = cluster.point.x * view.scale + view.x - MARKER_HIT_R;
                        const top = cluster.point.y * view.scale + view.y - MARKER_HIT_R;
                        return (
                          <ClusterPin
                            key={cluster.id}
                            left={left}
                            top={top}
                            count={cluster.count}
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

function ClusterPin({ left, top, count }: { left: number; top: number; count: number }) {
  const hit = CLUSTER_SCREEN_PX;
  const pin = (PIN_OUTER_R + PIN_STROKE) * 2;
  return (
    <View pointerEvents="none" style={[styles.hit, { left, top, width: hit, height: hit }]}>
      <View
        style={[
          styles.pin,
          {
            width: pin,
            height: pin,
            borderRadius: pin / 2,
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
      {count > 1 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? "9+" : String(count)}</Text>
        </View>
      ) : null}
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
  hit: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  pin: {
    backgroundColor: colors.white,
    borderColor: colors.waterMid,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.95,
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: BADGE_R * 2,
    height: BADGE_R * 2,
    borderRadius: BADGE_R,
    backgroundColor: colors.waterMid,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    ...typeStyle.caption,
    fontSize: 10,
    lineHeight: 12,
    color: colors.white,
    fontWeight: "700",
  },
});
