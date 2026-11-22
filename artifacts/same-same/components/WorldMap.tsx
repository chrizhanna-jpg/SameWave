import { geoEqualEarth, geoPath } from "d3-geo";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
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
  CITY_MERGE_KM,
  CLUSTER_BADGE_SIZE,
  CLUSTER_SCREEN_PX,
  focusBounds,
  frameTransform,
  incrementalPinchStep,
  isStickyStack,
  lineAt,
  type MapCluster,
  type MapLine,
  type PinchPrev,
  type Point,
} from "@/core/mapGeometry";
import { Photo } from "@/components/Photo";
import { PhotoMetaChip } from "@/components/PhotoMetaChip";
import {
  isApproximateCountrySource,
  type CaptureCountrySource,
} from "@/core/captureCountry";
import type { Wave } from "@/core/types";
import { waveListPlace, waveListWhen } from "@/core/waveListMeta";
import { centroidLonLatForCountry } from "@/data/countryCentroids";
import { useReducedMotion } from "@/device/motion";
import { useAppState } from "@/state/AppState";
import { colors, motion, space, type as typeStyle } from "@/theme";

function sideSource(
  side: Wave["mine"],
  rippleSource: CaptureCountrySource | null | undefined,
): CaptureCountrySource | null {
  return rippleSource ?? side.countrySource ?? null;
}

function sideApproximate(
  side: Wave["mine"],
  rippleSource: CaptureCountrySource | null | undefined,
): boolean {
  return isApproximateCountrySource(sideSource(side, rippleSource));
}

/** Side-by-side thumb size for the city-stack pull-up list. */
const LIST_THUMB = 64;

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
/** Count badge diameter (screen px). Local so StyleSheet never sees an undefined import. */
const BADGE_SIZE = CLUSTER_BADGE_SIZE ?? 24;
/** @deprecated alias kept so any stale reference cannot crash the bundle. */
const BADGE_R = BADGE_SIZE / 2;
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
  const { ripples } = useAppState();
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
  /** Keeps pin chrome screen-fixed while the land layer zooms (1 / scale). */
  const invScale = useRef(new Animated.Value(1)).current;
  /** Previous pinch sample for incremental focal maths (reset at BEGAN). */
  const pinchPrev = useRef<PinchPrev>({ pinchScale: 1, focalX: 0, focalY: 0 });
  const pan0 = useRef({ x: 0, y: 0 });
  const live = useRef({ scale: 1, x: 0, y: 0 });
  const framedFor = useRef<string>("");
  /**
   * React view state is for clustering / stroke width only. Updating it every
   * pinch frame re-rendered the SVG land path and rebuilt clusters → flicker
   * on Android. Gesture frames drive Animated values; we commit here on end.
   */
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [clusterList, setClusterList] = useState<MapCluster | null>(null);

  const applyLiveTransform = useCallback(
    (next: { scale: number; x: number; y: number }) => {
      live.current = next;
      scale.setValue(next.scale);
      translateX.setValue(next.x);
      translateY.setValue(next.y);
      invScale.setValue(1 / Math.max(next.scale, 0.05));
    },
    [scale, translateX, translateY, invScale],
  );

  const commitView = useCallback(
    (next: { scale: number; x: number; y: number }) => {
      applyLiveTransform(next);
      setView((current) =>
        current.scale === next.scale && current.x === next.x && current.y === next.y
          ? current
          : next,
      );
    },
    [applyLiveTransform],
  );

  const waveInputs = useMemo(
    () =>
      waves.map((wave) => {
        const mineRipple = ripples.find((r) => r.photoId === wave.mine.photoId);
        const mineApprox = sideApproximate(wave.mine, mineRipple?.captureCountrySource);
        const theirsApprox = sideApproximate(wave.theirs, null);
        return {
          id: wave.id,
          mine: wave.mine.countryCode,
          theirs: wave.theirs.countryCode,
          mineLonLat:
            !mineApprox && wave.mine.lng != null && wave.mine.lat != null
              ? ([wave.mine.lng, wave.mine.lat] as [number, number])
              : null,
          theirsLonLat:
            !theirsApprox && wave.theirs.lng != null && wave.theirs.lat != null
              ? ([wave.theirs.lng, wave.theirs.lat] as [number, number])
              : null,
          mineApproximate: mineApprox,
          theirsApproximate: theirsApprox,
        };
      }),
    [waves, ripples],
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
      mapWidth: map.width,
      cityMergeKm: CITY_MERGE_KM,
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
      const floor = Math.max(live.current.scale * minScaleBump, MIN_SCALE);
      const next = frameTransform(bounds, box, {
        padding: 56,
        minScale: Math.min(MAX_SCALE, floor),
        maxScale: MAX_SCALE,
      });
      const clamped = clampPan(next.scale, next.x, next.y);
      commitView({ scale: next.scale, x: clamped.x, y: clamped.y });
    },
    [map, box, clampPan, commitView],
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
        mapWidth: map.width,
        cityMergeKm: CITY_MERGE_KM,
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
    commitView({ scale: next.scale, x: clamped.x, y: clamped.y });
  }, [map, box, waves, waveInputs, homeCountry, clampPan, commitView]);

  const onPinchGestureEvent = useCallback(
    (event: PinchGestureHandlerGestureEvent) => {
      const { scale: pinchScale, focalX, focalY, numberOfPointers } = event.nativeEvent;
      const stepped = incrementalPinchStep(
        live.current,
        pinchPrev.current,
        { pinchScale, focalX, focalY, numberOfPointers },
        { minScale: MIN_SCALE, maxScale: MAX_SCALE },
      );
      if (!stepped.applied) return;
      pinchPrev.current = stepped.prev;
      const pan = clampPan(stepped.live.scale, stepped.live.x, stepped.live.y);
      // Animated only — no React setState (avoids SVG/cluster flicker).
      applyLiveTransform({ scale: stepped.live.scale, x: pan.x, y: pan.y });
    },
    [clampPan, applyLiveTransform],
  );

  const onPinchStateChange = useCallback(
    (event: HandlerStateChangeEvent<PinchGestureHandlerEventPayload>) => {
      const { state, focalX, focalY } = event.nativeEvent;
      if (state === State.BEGAN) {
        // Incremental baseline: gesture scale starts at 1 under the fingers.
        pinchPrev.current = { pinchScale: 1, focalX, focalY };
      }
      // When a finger lifts, re-baseline pan from the live transform so the
      // remaining finger can drag without a jump, and commit React view for
      // clustering / stroke width.
      if (
        state === State.END ||
        state === State.CANCELLED ||
        state === State.FAILED
      ) {
        pan0.current = { x: live.current.x, y: live.current.y };
        commitView({ ...live.current });
      }
    },
    [commitView],
  );

  const onPanGestureEvent = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      const next = clampPan(
        live.current.scale,
        pan0.current.x + event.nativeEvent.translationX,
        pan0.current.y + event.nativeEvent.translationY,
      );
      applyLiveTransform({ scale: live.current.scale, x: next.x, y: next.y });
    },
    [clampPan, applyLiveTransform],
  );

  const onPanStateChange = useCallback(
    (event: HandlerStateChangeEvent<PanGestureHandlerEventPayload>) => {
      if (event.nativeEvent.state === State.BEGAN) {
        pan0.current = { x: live.current.x, y: live.current.y };
      }
      if (
        event.nativeEvent.state === State.END ||
        event.nativeEvent.state === State.CANCELLED ||
        event.nativeEvent.state === State.FAILED
      ) {
        commitView({ ...live.current });
      }
    },
    [commitView],
  );

  const onMapPress = useCallback(
    (screenX: number, screenY: number) => {
      const s = live.current.scale || 1;
      for (const cluster of geometry.clusters) {
        const sx = cluster.point.x * s + live.current.x;
        const sy = cluster.point.y * s + live.current.y;
        if (Math.hypot(sx - screenX, sy - screenY) > MARKER_HIT_R) continue;
        if (cluster.count > 1) {
          // City-level sticky stack → list. Zoom-only merge → zoom in to split.
          if (isStickyStack(cluster, CITY_MERGE_KM)) {
            setClusterList(cluster);
          } else {
            zoomToBounds(cluster.members.map((m) => m.point));
          }
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
                      {/*
                        Pins live in map space under the same Animated transform
                        as the land, with invScale so chrome stays screen-fixed.
                        Avoids per-frame React left/top updates that flickered.
                      */}
                      {geometry.clusters.map((cluster) => {
                        const approximate = cluster.members.every((m) => m.approximate);
                        const hit = CLUSTER_SCREEN_PX;
                        return (
                          <Animated.View
                            key={cluster.id}
                            pointerEvents="none"
                            style={[
                              styles.hit,
                              {
                                left: cluster.point.x - MARKER_HIT_R,
                                top: cluster.point.y - MARKER_HIT_R,
                                width: hit,
                                height: hit,
                                transform: [{ scale: invScale }],
                              },
                            ]}
                          >
                            <ClusterPin count={cluster.count} approximate={approximate} />
                          </Animated.View>
                        );
                      })}
                    </Animated.View>
                  </Animated.View>
                </TapGestureHandler>
              </Animated.View>
            </PanGestureHandler>
          </Animated.View>
        </PinchGestureHandler>
      ) : null}

      <Modal
        visible={Boolean(clusterList)}
        transparent
        animationType="fade"
        onRequestClose={() => setClusterList(null)}
      >
        <Pressable style={styles.listScrim} onPress={() => setClusterList(null)}>
          <Pressable style={styles.listCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.listHandle} accessibilityLabel="Wave list" />
            <Text style={styles.listTitle}>
              {clusterList ? `${clusterList.count} Waves here` : ""}
            </Text>
            {clusterList?.members.map((m) => {
              const wave = waves.find((w) => w.id === m.waveId);
              const side = wave ? (m.side === "mine" ? wave.mine : wave.theirs) : null;
              const sideRipple =
                wave && m.side === "mine"
                  ? ripples.find((r) => r.photoId === wave.mine.photoId) ?? null
                  : null;
              const approx = side
                ? sideApproximate(side, sideRipple?.captureCountrySource)
                : Boolean(m.approximate);
              const place = waveListPlace({
                countryCode: side?.countryCode,
                countrySource: side ? sideSource(side, sideRipple?.captureCountrySource) : null,
                approximate: approx,
              });
              const when = waveListWhen(side?.takenAt ?? wave?.formedAt);
              const ripple = wave
                ? ripples.find((r) => r.photoId === wave.mine.photoId) ?? null
                : null;
              // Sample fixtures carry emotion/theme on the photo id when no ripple.
              let sampleEmotion: string | null = null;
              let sampleTopic: string | null = null;
              if (wave && process.env.EXPO_PUBLIC_TEST_PHOTOS === "1") {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const { TEST_PHOTO_META } = require("../assets/test-photos/fixtures") as {
                  TEST_PHOTO_META: readonly { id: string; theme: string; emotion: string }[];
                };
                const meta =
                  TEST_PHOTO_META.find((row) => row.id === (side?.photoId ?? wave.mine.photoId)) ??
                  null;
                sampleEmotion = meta?.emotion ?? null;
                sampleTopic = meta?.theme ?? null;
              }
              // Other side: server emotion/theme on the WaveSide. Own side: local
              // ledger. Never use music vibe as the Feeling chip.
              const emotion =
                m.side === "theirs"
                  ? (side?.emotion ?? sampleEmotion)
                  : (ripple?.emotion ?? side?.emotion ?? sampleEmotion);
              const topic =
                m.side === "theirs"
                  ? (side?.theme ?? sampleTopic)
                  : (ripple?.topic ?? ripple?.theme ?? side?.theme ?? sampleTopic);
              return (
                <Pressable
                  key={`${m.waveId}-${m.side}`}
                  style={styles.listRow}
                  onPress={() => {
                    setClusterList(null);
                    onOpenWave(m.waveId);
                  }}
                >
                  <View style={styles.listPair}>
                    <View style={styles.listThumb}>
                      {wave ? (
                        <Photo
                          uri={wave.mine.uri}
                          ownPhotoId={wave.mine.uri ? undefined : wave.mine.photoId}
                          blurIn
                          style={styles.listThumbImg}
                          accessibilityLabel="Your photo"
                        />
                      ) : (
                        <View style={styles.listThumbEmpty} />
                      )}
                    </View>
                    <View style={styles.listThumb}>
                      {wave ? (
                        <Photo
                          uri={wave.theirs.uri}
                          ownPhotoId={wave.theirs.uri ? undefined : wave.theirs.photoId}
                          blurIn
                          style={styles.listThumbImg}
                          accessibilityLabel="Their photo"
                        />
                      ) : (
                        <View style={styles.listThumbEmpty} />
                      )}
                    </View>
                  </View>
                  <View style={styles.listMeta}>
                    <Text style={styles.listRowText} numberOfLines={1}>
                      {place}
                      {approx ? " · approx." : ""}
                    </Text>
                    <PhotoMetaChip
                      emotion={emotion}
                      topic={topic}
                      style={styles.listChip}
                    />
                    {when ? (
                      <Text style={styles.listRowSub} numberOfLines={1}>
                        {when}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
            <Pressable style={styles.listClose} onPress={() => setClusterList(null)}>
              <Text style={styles.listCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </GestureHandlerRootView>
  );
}

function ClusterPin({
  count,
  approximate = false,
}: {
  count: number;
  approximate?: boolean;
}) {
  const pin = (PIN_OUTER_R + PIN_STROKE) * 2;
  return (
    <>
      <View
        style={[
          styles.pin,
          approximate ? styles.pinApprox : null,
          {
            width: pin,
            height: pin,
            borderRadius: pin / 2,
            borderWidth: PIN_STROKE,
          },
        ]}
      >
        {approximate ? null : (
          <View
            style={{
              width: PIN_CORE_R * 2,
              height: PIN_CORE_R * 2,
              borderRadius: PIN_CORE_R,
              backgroundColor: colors.waterMid,
            }}
          />
        )}
      </View>
      {count > 1 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? "9+" : String(count)}</Text>
        </View>
      ) : null}
    </>
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
  /** Hollow / dashed look for profile-fallback (approximate) pins. */
  pinApprox: {
    backgroundColor: "transparent",
    borderStyle: "dashed",
    opacity: 0.85,
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_R,
    backgroundColor: colors.waterMid,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.white,
  },
  badgeText: {
    ...typeStyle.label,
    fontSize: 13,
    lineHeight: 16,
    color: colors.white,
    fontWeight: "700",
  },
  listScrim: {
    flex: 1,
    backgroundColor: "rgba(15, 30, 40, 0.45)",
    justifyContent: "flex-end",
  },
  listCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xl,
    gap: space.sm,
  },
  listHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: space.md,
  },
  listTitle: {
    ...typeStyle.heading,
    color: colors.slate,
    marginBottom: space.xs,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    minHeight: LIST_THUMB + space.md * 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(63,74,75,0.15)",
  },
  listPair: {
    flexDirection: "row",
    gap: 6,
  },
  listThumb: {
    width: LIST_THUMB,
    height: LIST_THUMB,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "rgba(63,74,75,0.08)",
  },
  listThumbImg: { width: LIST_THUMB, height: LIST_THUMB },
  listThumbEmpty: { flex: 1, backgroundColor: colors.waterMuted, opacity: 0.35 },
  listMeta: { flex: 1, gap: 2, justifyContent: "center", minWidth: 0 },
  listChip: { alignItems: "flex-start", marginTop: 1, marginBottom: 1 },
  listRowText: {
    ...typeStyle.body,
    color: colors.slate,
  },
  listRowSub: {
    ...typeStyle.label,
    color: colors.waterMuted,
  },
  listClose: {
    marginTop: space.md,
    alignItems: "center",
    paddingVertical: space.md,
  },
  listCloseText: {
    ...typeStyle.button,
    color: colors.waterMid,
  },
});
