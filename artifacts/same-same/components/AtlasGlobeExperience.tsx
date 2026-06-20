/**
 * Atlas globe: Equal Earth projection, live ripple/wave arcs, travelling dots,
 * filters (including Wavefire), country stats modal.
 *
 * ## Testing notes (timing & filters)
 * - **All:** every connection from the API should show a line; ripples get one
 *   looping dot (origin→destination) at half the wave dot’s speed; waves get a
 *   fast dot that ping-pongs until the row disappears from the payload after refresh.
 * - **Ripples only / Waves only:** toggling should immediately remove the other
 *   kind’s lines and dots; surviving dots should keep smooth motion (no jump
 *   to t=0 unless the connection id left and re-entered the list).
 * - **My activity:** requires a signed-in session and `mine: true` on rows from
 *   `GET /api/photos/atlas` (both sides of a pending ripple, both participants
 *   in a wave).
 * - **Wavefire:** needs ≥3 recent echo arcs that **link by shared theme, shared
 *   vibe tag(s), or shared subject(s)** (transitive), spanning ≥3 distinct
 *   countries within `WAVEFIRE_WINDOW_MS`. When active, an animated wavy closed
 *   loop links those countries; pair arcs and travelling dots are hidden so only
 *   the Wavefire ring and ember path glow remain. A short label (theme / tag /
 *   subject) is shown under the stats row. If nothing matches, the night map shows
 *   the empty copy and a faint idle ember circle; the country ring only appears
 *   once a cluster is detected.
 * - **Zoom / pan:** one-finger drag pans; pinch zooms with focal anchoring
 *   (`tx' = fx - (s'/s)(fx - tx)`). Transform is translate then scale with
 *   `transformOrigin` top-left. Translate is clamped using **scaled** canvas size
 *   (`vw - cw*s` … `0`) so the map cannot slide off into empty space; double-tap
 *   resets translate + scale.
 * - **Performance:** cap `ATLAS_MAX_ANIMATED_CONNECTIONS` on **moving dots**
 *   (ripples are prioritized so their green dots are not dropped when many
 *   waves exist); extra arcs still render but may skip dots.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import type { GeoProjection } from "d3-geo";

import {
  fetchAtlasCountryPhotos,
  type AtlasConnection,
  type AtlasCountry,
  type LocalRippleExploreMatch,
  type LocalWaveExploreEcho,
  type ViewerExplorePhoto,
} from "@/utils/api";
import { flagFor, nameFor } from "@/data/countries";
import { AtlasFireExploreModal } from "@/components/AtlasFireExploreModal";
import { PressableScale } from "@/components/PressableScale";
import { Icon, type IconName } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import {
  atlasArcPathD,
  atlasArcPointAt,
  atlasArcSegment,
  atlasWavefireRingPathD,
  createAtlasProjection,
  type AtlasScreenPoint,
} from "@/utils/atlasArcPath";
import { centroidLonLatForAtlas } from "@/utils/atlasCountryCentroids";
import {
  ATLAS_FIRE_WINDOW_MS,
  RIPPLEFIRE_MIN_COUNTRIES,
  RIPPLEFIRE_MIN_EVENTS,
  WAVEFIRE_MIN_COUNTRIES,
  WAVEFIRE_MIN_EVENTS,
} from "@/utils/atlasFireConfig";
import {
  ATLAS_COUNTRY_MODAL,
  ATLAS_FILTER_A11Y,
  ATLAS_FILTER_HINT,
  ATLAS_FILTER_HINT_MINE_SIGNIN,
} from "@/data/waveRippleGlossary";
import {
  atlasFireVisual,
  type AtlasFireMode,
  type AtlasFireVisual,
} from "@/utils/atlasFireVisuals";
import {
  detectRipplefireClusters,
  detectWavefireClusters,
  connectionsInFireWindow,
  orderWavefireRingCountryCodes,
  synthesizeRipplefireCluster,
  synthesizeWavefireCluster,
  type AtlasThemeCluster,
} from "@/utils/atlasWavefire";
import { atlasLandPathD } from "@/utils/atlasWorldLand";
import {
  duckFirecircleActivity,
  setFirecircleMapScale,
} from "@/utils/firecircleAudio";
import { buildFirecircleTiles, type FirecircleTileModel } from "@/utils/firecircleLayout";
import {
  isTrustedFirecircleThumbUrl,
  resolveFirecircleThumbUri,
} from "@/utils/firecircleThumbPolicy";
import {
  startWavefireAmbience,
  stopWavefireAmbience,
} from "@/utils/wavefireAmbience";

export type AtlasFilterMode =
  | "all"
  | "ripples"
  | "waves"
  | "mine"
  | "ripplefire"
  | "wavefire";

function isFireFilter(
  mode: AtlasFilterMode,
): mode is "ripplefire" | "wavefire" {
  return mode === "ripplefire" || mode === "wavefire";
}

const EMPTY_FIRE_CLUSTERS: AtlasThemeCluster[] = [];

function atlasFireModeFromFilter(
  mode: AtlasFilterMode,
): AtlasFireMode | null {
  if (mode === "wavefire" || mode === "ripplefire") return mode;
  return null;
}

const ATLAS_MAP_ANIM_BASE_MS = 14_000;
/** Half of one wave ping-pong leg (same timing as before). */
const ATLAS_WAVE_HALF_MS = Math.round(ATLAS_MAP_ANIM_BASE_MS / 2.65);
/**
 * Ripple dot runs sender→receiver on a loop; duration = 2× wave half-leg so it
 * moves at half the wave dot’s speed along the same arc length per leg.
 */
const ATLAS_RIPPLE_TRAVEL_MS = ATLAS_WAVE_HALF_MS * 2;
const ATLAS_LINE_FADE_MS = 520;
const ATLAS_MAX_ANIMATED_CONNECTIONS = 120;
const HIT_R = 22;
/** Stroke gradient for the Wavefire ring loop (ember / fire tones). */
const WAVEFIRE_RING_FIRE_GRAD_ID = "atlasWavefireRingFireGrad";
const WAVEFIRE_RING_SAMPLES_PER_LEG = 22;
const WAVEFIRE_RING_WAVE_FREQ = 0.026;
const WAVEFIRE_RING_WAVE_AMP_PX = 10.5;
/** Second harmonic for snakier motion along the ring (screen px). */
const WAVEFIRE_RING_WAVE_SECOND = 4.2;

function hashWavefireSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Screen-space ellipse ring between two countries (avoids A→B + B→A twin arcs). */
function wavefireTwoCountryEllipsePoints(
  projection: GeoProjection,
  codes: string[],
  samples = 36,
): AtlasScreenPoint[] {
  const pts: AtlasScreenPoint[] = [];
  for (const code of codes) {
    const ll = centroidLonLatForAtlas(code);
    if (!ll) continue;
    const p = projection([ll[0], ll[1]]);
    if (!p) continue;
    pts.push({ x: p[0], y: p[1] });
  }
  if (pts.length < 2) return pts;
  const [p0, p1] = pts;
  const mx = (p0.x + p1.x) / 2;
  const my = (p0.y + p1.y) / 2;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dist = Math.hypot(dx, dy);
  const rx = dist * 0.48;
  const ry = Math.max(32, dist * 0.2);
  const rot = Math.atan2(dy, dx);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const ring: AtlasScreenPoint[] = [];
  const n = Math.max(24, samples);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    ring.push({
      x: mx + ex * cos - ey * sin,
      y: my + ex * sin + ey * cos,
    });
  }
  return ring;
}

/** Centroid ring vertices for Wavefire (ellipse when exactly two countries). */
function wavefireRingScreenPoints(
  projection: GeoProjection,
  countryCodes: string[],
): AtlasScreenPoint[] {
  const ordered = orderWavefireRingCountryCodes(countryCodes, projection);
  if (ordered.length < 2) {
    const solo: AtlasScreenPoint[] = [];
    for (const code of ordered) {
      const ll = centroidLonLatForAtlas(code);
      if (!ll) continue;
      const p = projection([ll[0], ll[1]]);
      if (!p) continue;
      solo.push({ x: p[0], y: p[1] });
    }
    return solo;
  }
  if (ordered.length === 2) {
    return wavefireTwoCountryEllipsePoints(projection, ordered);
  }
  const ring: AtlasScreenPoint[] = [];
  for (const code of ordered) {
    const ll = centroidLonLatForAtlas(code);
    if (!ll) continue;
    const p = projection([ll[0], ll[1]]);
    if (!p) continue;
    ring.push({ x: p[0], y: p[1] });
  }
  return ring;
}

/**
 * One continuous closed path through Wavefire countries along the same great-circle
 * segments as the map arcs, with a perpendicular wobble in screen space (animated
 * via `nowMs` so the ripple travels along the loop).
 */
function buildWavefireWavyRingPathD(
  projection: GeoProjection,
  countryCodes: string[],
  themeSeed: string,
  nowMs: number,
): string | null {
  const ordered = orderWavefireRingCountryCodes(countryCodes, projection);
  if (ordered.length < 2) {
    return null;
  }

  let base: { x: number; y: number }[];

  if (ordered.length === 2) {
    base = wavefireTwoCountryEllipsePoints(projection, ordered, 40);
  } else {
    const k = WAVEFIRE_RING_SAMPLES_PER_LEG;
    base = [];
    const pushPt = (x: number, y: number) => {
      const last = base[base.length - 1];
      if (last && Math.hypot(x - last.x, y - last.y) < 0.4) return;
      base.push({ x, y });
    };
    const nSeg = ordered.length;
    for (let i = 0; i < nSeg; i++) {
      const a = centroidLonLatForAtlas(ordered[i]!);
      const b = centroidLonLatForAtlas(ordered[(i + 1) % nSeg]!);
      if (!a || !b) {
        return null;
      }
      const seg = atlasArcSegment(projection, a, b);
      if (!seg) {
        return null;
      }
      const isLast = i === nSeg - 1;
      const maxS = isLast ? k : k - 1;
      for (let s = 0; s <= maxS; s++) {
        const u = s / k;
        const p = atlasArcPointAt(seg, Math.min(1, Math.max(0, u)));
        pushPt(p.x, p.y);
      }
    }
  }

  if (base.length < 4) {
    return null;
  }
  const n = base.length;
  const cum = new Array<number>(n);
  cum[0] = 0;
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1]! + Math.hypot(base[i]!.x - base[i - 1]!.x, base[i]!.y - base[i - 1]!.y);
  }
  const phase = (hashWavefireSeed(`${themeSeed}:wavy-ring`) % 6283) / 1000;
  const travel = nowMs * 0.00024;
  const waved: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const ip = (i - 1 + n) % n;
    const inn = (i + 1) % n;
    const vx = base[inn]!.x - base[ip]!.x;
    const vy = base[inn]!.y - base[ip]!.y;
    const vlen = Math.hypot(vx, vy) || 1;
    const nx = -vy / vlen;
    const ny = vx / vlen;
    const s = cum[i]!;
    const ampMod = 0.72 + 0.28 * Math.sin(s * 0.007 + phase * 0.5);
    const wob =
      WAVEFIRE_RING_WAVE_AMP_PX *
        ampMod *
        Math.sin(s * WAVEFIRE_RING_WAVE_FREQ + phase + travel) +
      WAVEFIRE_RING_WAVE_SECOND *
        Math.sin(s * WAVEFIRE_RING_WAVE_FREQ * 2.2 - travel * 1.05 + phase * 0.65);
    waved.push({
      x: base[i]!.x + nx * wob,
      y: base[i]!.y + ny * wob,
    });
  }
  const p0 = waved[0]!;
  let d = `M${p0.x},${p0.y}`;
  for (let i = 1; i < waved.length; i++) {
    d += `L${waved[i]!.x},${waved[i]!.y}`;
  }
  d += "Z";
  return d;
}

function parseCreatedMs(c: AtlasConnection): number {
  const t = Date.parse(c.createdAt);
  return Number.isFinite(t) ? t : 0;
}

function normalizeConnections(raw: AtlasConnection[]): AtlasConnection[] {
  const seen = new Set<string>();
  const out: AtlasConnection[] = [];
  for (const c of raw) {
    const from = c.from.trim().toUpperCase();
    const to = c.to.trim().toUpperCase();
    if (from.length !== 2 || to.length !== 2 || from === to) continue;
    const key = c.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...c, from, to });
  }
  return out;
}

function filterConnections(
  list: AtlasConnection[],
  mode: AtlasFilterMode,
  isSignedIn: boolean,
): AtlasConnection[] {
  if (mode === "all") return list;
  /** Globe draws only `fireCluster.connections`; keep base empty so nothing leaks. */
  if (isFireFilter(mode)) return [];
  if (mode === "ripples") return list.filter((c) => c.kind === "ripple");
  if (mode === "waves") return list.filter((c) => c.kind === "wave");
  if (mode === "mine") {
    if (!isSignedIn) return [];
    return list.filter((c) => c.mine === true);
  }
  return list;
}

function countryStatsFor(
  code: string,
  list: AtlasConnection[],
): {
  ripplesSent: number;
  ripplesReceived: number;
  waves: number;
  lastMs: number;
} {
  let ripplesSent = 0;
  let ripplesReceived = 0;
  let waves = 0;
  let lastMs = 0;
  for (const c of list) {
    const ms = parseCreatedMs(c);
    if (c.kind === "ripple") {
      if (c.from === code) ripplesSent++;
      if (c.to === code) ripplesReceived++;
    } else if (c.kind === "wave") {
      if (c.from === code || c.to === code) waves++;
    }
    if ((c.from === code || c.to === code) && ms > lastMs) lastMs = ms;
  }
  return { ripplesSent, ripplesReceived, waves, lastMs };
}

type PreparedArc = {
  id: string;
  c: AtlasConnection;
  d: string;
  seg: NonNullable<ReturnType<typeof atlasArcSegment>>;
};

const ATLAS_MIN_ZOOM = 0.55;
const ATLAS_MAX_ZOOM = 5;
const ATLAS_MAP_FALLBACK_H = 280;

/** Clamp translate so the scaled canvas still covers the clip rect (no void). */
function clampAtlasMapPan(
  px: number,
  py: number,
  vw: number,
  vh: number,
  cw: number,
  ch: number,
  s: number,
): { x: number; y: number } {
  "worklet";
  const minX = vw - cw * s;
  const maxX = 0;
  const minY = vh - ch * s;
  const maxY = 0;
  const loX = Math.min(minX, maxX);
  const hiX = Math.max(minX, maxX);
  const loY = Math.min(minY, maxY);
  const hiY = Math.max(minY, maxY);
  return {
    x: Math.min(hiX, Math.max(loX, px)),
    y: Math.min(hiY, Math.max(loY, py)),
  };
}
/** Larger projected canvas than the viewport so panning reveals geography (not an empty margin). */
const ATLAS_MAP_OVERSAMPLE = 2.45;
/** Ember accent — Wavefire filter chip, ring stroke, stat pill. */
const WAVEFIRE_EMBER_CORE = "#fb923c";
const WAVEFIRE_LINE_STROKE = "#ff6b35";

/** iOS-only: colored shadow reads as ember glow (Android uses halo fill + border). */
const WAVEFIRE_CHIP_SHADOW_IOS_IDLE = {
  shadowColor: WAVEFIRE_LINE_STROKE,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.45,
  shadowRadius: 10,
} as const satisfies ViewStyle;

const WAVEFIRE_CHIP_SHADOW_IOS_ACTIVE = {
  shadowColor: WAVEFIRE_EMBER_CORE,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.72,
  shadowRadius: 16,
} as const satisfies ViewStyle;

interface Props {
  width: number;
  connections: AtlasConnection[];
  countries: AtlasCountry[];
  isSignedIn: boolean;
  /** False when another tab is focused — pauses Wavefire ambience. */
  isTabFocused?: boolean;
  /** When set, country modal shows "View moments". */
  onOpenCountryPhotos?: (code: string) => void;
  localRippleMatches?: LocalRippleExploreMatch[];
  localWaveEchoes?: LocalWaveExploreEcho[];
  viewerCountryCode?: string;
  viewerMyPhotos?: ViewerExplorePhoto[];
  style?: StyleProp<ViewStyle>;
}

export function AtlasGlobeExperience({
  width,
  connections,
  countries,
  isSignedIn,
  isTabFocused = true,
  onOpenCountryPhotos,
  localRippleMatches,
  localWaveEchoes,
  viewerCountryCode,
  viewerMyPhotos,
  style,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [mapPixelH, setMapPixelH] = useState(ATLAS_MAP_FALLBACK_H);
  const [wfPhotoTile, setWfPhotoTile] = useState<FirecircleTileModel | null>(null);
  const [wfPhotoUri, setWfPhotoUri] = useState<string | null>(null);
  const [wfPhotoLoading, setWfPhotoLoading] = useState(false);

  const mapW = useSharedValue(width);
  const mapH = useSharedValue(ATLAS_MAP_FALLBACK_H);
  const canvasW = useSharedValue(width * ATLAS_MAP_OVERSAMPLE);
  const canvasH = useSharedValue(ATLAS_MAP_FALLBACK_H * ATLAS_MAP_OVERSAMPLE);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const scale = useSharedValue(1);
  const pinchBase = useSharedValue(1);
  const panGestureOriginX = useSharedValue(0);
  const panGestureOriginY = useSharedValue(0);

  useEffect(() => {
    mapW.value = width;
  }, [mapW, width]);

  useEffect(() => {
    const cw = width * ATLAS_MAP_OVERSAMPLE;
    const ch = mapPixelH * ATLAS_MAP_OVERSAMPLE;
    canvasW.value = cw;
    canvasH.value = ch;
    mapH.value = mapPixelH;
    panX.value = (width - cw) / 2;
    panY.value = (mapPixelH - ch) / 2;
    scale.value = 1;
  }, [width, mapPixelH]); // eslint-disable-line react-hooks/exhaustive-deps -- shared values; only reset when viewport size changes

  const animatedMapStyle = useAnimatedStyle(() => ({
    width: canvasW.value,
    height: canvasH.value,
    // Pinch math below assumes scale is about the map's top-left. RN defaults
    // scale about the view center, which makes focal anchoring feel wrong.
    transformOrigin: ["0%", "0%", 0] as const,
    transform: [
      { translateX: panX.value },
      { translateY: panY.value },
      { scale: scale.value },
    ],
  }));

  const syncFirecircleZoom = useCallback((v: number) => {
    setFirecircleMapScale(v);
  }, []);

  useAnimatedReaction(
    () => scale.value,
    (v, prev) => {
      if (prev === null) {
        runOnJS(syncFirecircleZoom)(v);
        return;
      }
      if (Math.abs(v - prev) > 0.03) {
        runOnJS(syncFirecircleZoom)(v);
      }
    },
    [syncFirecircleZoom],
  );

  const mapPinch = Gesture.Pinch()
    .onBegin(() => {
      pinchBase.value = scale.value;
      runOnJS(duckFirecircleActivity)();
    })
    .onUpdate((e) => {
      const vw = mapW.value;
      const vh = mapH.value;
      const cw = canvasW.value;
      const ch = canvasH.value;
      const fx = e.focalX;
      const fy = e.focalY;
      const sPrev = scale.value;
      let sNext = pinchBase.value * e.scale;
      if (sNext < ATLAS_MIN_ZOOM) sNext = ATLAS_MIN_ZOOM;
      if (sNext > ATLAS_MAX_ZOOM) sNext = ATLAS_MAX_ZOOM;
      if (sPrev <= 0) {
        scale.value = sNext;
        const c0 = clampAtlasMapPan(
          panX.value,
          panY.value,
          vw,
          vh,
          cw,
          ch,
          sNext,
        );
        panX.value = c0.x;
        panY.value = c0.y;
        return;
      }
      const ratio = sNext / sPrev;
      panX.value = fx - ratio * (fx - panX.value);
      panY.value = fy - ratio * (fy - panY.value);
      scale.value = sNext;
    })
    .onFinalize(() => {
      const vw = mapW.value;
      const vh = mapH.value;
      const cw = canvasW.value;
      const ch = canvasH.value;
      const s = scale.value;
      const c = clampAtlasMapPan(panX.value, panY.value, vw, vh, cw, ch, s);
      panX.value = c.x;
      panY.value = c.y;
    });

  const mapPan = Gesture.Pan()
    .maxPointers(1)
    .onBegin(() => {
      panGestureOriginX.value = panX.value;
      panGestureOriginY.value = panY.value;
    })
    .onUpdate((e) => {
      const vw = mapW.value;
      const vh = mapH.value;
      const cw = canvasW.value;
      const ch = canvasH.value;
      const s = scale.value;
      const nx = panGestureOriginX.value + e.translationX;
      const ny = panGestureOriginY.value + e.translationY;
      const c = clampAtlasMapPan(nx, ny, vw, vh, cw, ch, s);
      panX.value = c.x;
      panY.value = c.y;
    })
    .onFinalize(() => {
      const vw = mapW.value;
      const vh = mapH.value;
      const cw = canvasW.value;
      const ch = canvasH.value;
      const s = scale.value;
      const c = clampAtlasMapPan(panX.value, panY.value, vw, vh, cw, ch, s);
      panX.value = c.x;
      panY.value = c.y;
    });

  const mapDoubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(280)
    .onEnd(() => {
      const cx = (mapW.value - canvasW.value) / 2;
      const cy = (mapH.value - canvasH.value) / 2;
      panX.value = withTiming(cx, { duration: 220 });
      panY.value = withTiming(cy, { duration: 220 });
      scale.value = withTiming(1, { duration: 220 });
    });

  const mapGesture = Gesture.Simultaneous(mapPinch, mapPan, mapDoubleTap);

  const [filter, setFilter] = useState<AtlasFilterMode>("ripplefire");
  const [modalCode, setModalCode] = useState<string | null>(null);
  const [fireExploreOpen, setFireExploreOpen] = useState(false);
  const [fireClusterIndex, setFireClusterIndex] = useState(0);

  const timeRef = useRef(Date.now());
  const [, rafPulse] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    let id = 0;
    const loop = () => {
      timeRef.current = Date.now();
      rafPulse();
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);

  const normalized = useMemo(
    () => normalizeConnections(connections),
    [connections],
  );

  const ripplefireClusters = useMemo(
    () =>
      detectRipplefireClusters(
        normalized,
        ATLAS_FIRE_WINDOW_MS,
        RIPPLEFIRE_MIN_EVENTS,
        RIPPLEFIRE_MIN_COUNTRIES,
      ),
    [normalized],
  );

  const wavefireClusters = useMemo(
    () =>
      detectWavefireClusters(
        normalized,
        ATLAS_FIRE_WINDOW_MS,
        WAVEFIRE_MIN_EVENTS,
        WAVEFIRE_MIN_COUNTRIES,
      ),
    [normalized],
  );

  const fireMode = atlasFireModeFromFilter(filter);
  const fireVisual = fireMode ? atlasFireVisual(fireMode) : null;
  const fireClusters = useMemo(() => {
    if (fireMode === "wavefire") return wavefireClusters;
    if (fireMode === "ripplefire") return ripplefireClusters;
    return EMPTY_FIRE_CLUSTERS;
  }, [fireMode, wavefireClusters, ripplefireClusters]);

  useEffect(() => {
    setFireClusterIndex(0);
  }, [filter]);

  useEffect(() => {
    setFireClusterIndex((idx) => {
      const n = fireClusters.length;
      if (n === 0) return 0;
      return Math.min(idx, n - 1);
    });
  }, [fireClusters.length]);

  const fireCluster = fireClusters[fireClusterIndex] ?? null;

  const baseFiltered = useMemo(
    () => filterConnections(normalized, filter, isSignedIn),
    [normalized, filter, isSignedIn],
  );

  const fireWindowRipples = useMemo(
    () => connectionsInFireWindow(normalized, ATLAS_FIRE_WINDOW_MS, "ripple"),
    [normalized],
  );
  const fireWindowWaves = useMemo(
    () => connectionsInFireWindow(normalized, ATLAS_FIRE_WINDOW_MS, "wave"),
    [normalized],
  );

  const displayConnections = useMemo(() => {
    if (filter === "ripplefire") {
      if (fireCluster?.connections.length) return fireCluster.connections;
      if (fireWindowRipples.length) return fireWindowRipples;
      const allRipples = normalized.filter((c) => c.kind === "ripple");
      if (allRipples.length) return allRipples;
      return [];
    }
    if (filter === "wavefire") {
      if (fireCluster?.connections.length) return fireCluster.connections;
      if (fireWindowWaves.length) return fireWindowWaves;
      const allWaves = normalized.filter((c) => c.kind === "wave");
      if (allWaves.length) return allWaves;
      return [];
    }
    return baseFiltered;
  }, [filter, baseFiltered, fireCluster, fireWindowRipples, fireWindowWaves, normalized]);

  /** Device/server ripples without a themed cluster still activate Ripplefire UI. */
  const effectiveFireCluster = useMemo((): AtlasThemeCluster | null => {
    if (filter === "ripplefire") {
      return fireCluster ?? synthesizeRipplefireCluster(displayConnections);
    }
    if (filter === "wavefire") {
      return fireCluster ?? synthesizeWavefireCluster(displayConnections);
    }
    return fireCluster;
  }, [filter, fireCluster, displayConnections]);

  const canvasPixelW = width * ATLAS_MAP_OVERSAMPLE;
  const canvasPixelH = mapPixelH * ATLAS_MAP_OVERSAMPLE;

  const projection = useMemo(
    () =>
      createAtlasProjection(
        Math.max(1, canvasPixelW),
        Math.max(1, canvasPixelH),
        Math.max(1, width),
        Math.max(1, mapPixelH),
      ),
    [canvasPixelW, canvasPixelH, width, mapPixelH],
  );

  const prepared = useMemo(() => {
    const items: PreparedArc[] = [];
    for (const c of displayConnections) {
      const a = centroidLonLatForAtlas(c.from);
      const b = centroidLonLatForAtlas(c.to);
      if (!a || !b) continue;
      const seg = atlasArcSegment(projection, a, b);
      if (!seg) continue;
      const d = atlasArcPathD(projection, a, b);
      if (!d) continue;
      items.push({
        id: c.id,
        c,
        d,
        seg,
      });
    }
    return items.sort((u, v) => parseCreatedMs(v.c) - parseCreatedMs(u.c));
  }, [displayConnections, projection]);

  /** Dots only: prefer ripples so a busy wave feed does not evict ripple dots. */
  const animatedSlice = useMemo(() => {
    const ripples = prepared.filter((p) => p.c.kind === "ripple");
    const waves = prepared.filter((p) => p.c.kind === "wave");
    const cap = ATLAS_MAX_ANIMATED_CONNECTIONS;
    const rip = ripples.slice(0, cap);
    const waveSlots = Math.max(0, cap - rip.length);
    return [...rip, ...waves.slice(0, waveSlots)];
  }, [prepared]);

  const countryCodesOnMap = useMemo(() => {
    const s = new Set<string>();
    if (isFireFilter(filter)) {
      for (const c of displayConnections) {
        s.add(c.from);
        s.add(c.to);
      }
      return [...s].sort();
    }
    if (filter !== "mine") {
      for (const cc of countries) {
        if (cc.count > 0) s.add(cc.code.trim().toUpperCase());
      }
    }
    for (const c of displayConnections) {
      s.add(c.from);
      s.add(c.to);
    }
    return [...s].sort();
  }, [countries, displayConnections, filter]);

  const mapCountryCodes = useMemo(() => {
    if (isFireFilter(filter)) {
      return effectiveFireCluster?.countryCodes ?? [];
    }
    return countryCodesOnMap;
  }, [filter, effectiveFireCluster, countryCodesOnMap]);

  const centroidHits = useMemo(() => {
    return mapCountryCodes
      .map((code) => {
        const ll = centroidLonLatForAtlas(code);
        if (!ll) return null;
        const p = projection([ll[0], ll[1]]);
        if (!p) return null;
        return { code, cx: p[0], cy: p[1] };
      })
      .filter((x): x is { code: string; cx: number; cy: number } => x != null);
  }, [mapCountryCodes, projection]);

  const now = timeRef.current;
  const fireNight = isFireFilter(filter);
  const fireActive = fireNight && effectiveFireCluster != null;
  const wavefireActive = filter === "wavefire" && effectiveFireCluster != null;
  const ripplefireActive = filter === "ripplefire" && effectiveFireCluster != null;
  const wavefireCluster =
    filter === "wavefire" ? effectiveFireCluster : null;

  /**
   * Ripplefire map = closed wavy ring through cluster countries (not pair arcs).
   * One themed ripple across two countries still forms a ring.
   */
  const ripplefireRingEligible = useMemo(() => {
    if (!ripplefireActive || !effectiveFireCluster) return false;
    return (
      effectiveFireCluster.connections.length >= 1 &&
      effectiveFireCluster.countryCodes.length >= 2
    );
  }, [ripplefireActive, effectiveFireCluster]);

  const ripplefireSmoothRingD = useMemo(() => {
    if (!ripplefireActive || !effectiveFireCluster) return null;
    const points = wavefireRingScreenPoints(
      projection,
      effectiveFireCluster.countryCodes,
    );
    if (points.length < 2) return null;
    return atlasWavefireRingPathD(points, now * 0.0028);
  }, [ripplefireActive, effectiveFireCluster, projection, now]);

  const ripplefireWavyRingD = useMemo(() => {
    if (!ripplefireActive || !effectiveFireCluster) return null;
    return buildWavefireWavyRingPathD(
      projection,
      effectiveFireCluster.countryCodes,
      effectiveFireCluster.theme,
      now,
    );
  }, [ripplefireActive, effectiveFireCluster, projection, now]);

  const ripplefireDisplayRingD =
    ripplefireWavyRingD ?? ripplefireSmoothRingD;

  const ripplefireRingGlowFlick = useMemo(() => {
    if (!ripplefireDisplayRingD) return 1;
    const t = now * 0.004;
    return (
      0.78 +
      0.17 * (0.5 + 0.5 * Math.sin(t)) +
      0.05 * Math.sin(now * 0.019)
    );
  }, [ripplefireDisplayRingD, now]);

  const wavefireSmoothRingD = useMemo(() => {
    if (!wavefireActive || !wavefireCluster) return null;
    const points = wavefireRingScreenPoints(
      projection,
      wavefireCluster.countryCodes,
    );
    if (points.length < 2) return null;
    return atlasWavefireRingPathD(points, now * 0.0028);
  }, [wavefireActive, wavefireCluster, projection, now]);

  /** Single closed loop through Wavefire countries (wavy screen-space offset). */
  const wavefireWavyRingD = useMemo(() => {
    if (!wavefireActive || !wavefireCluster) return null;
    return buildWavefireWavyRingPathD(
      projection,
      wavefireCluster.countryCodes,
      wavefireCluster.theme,
      now,
    );
  }, [wavefireActive, wavefireCluster, projection, now]);

  const wavefireDisplayRingD = wavefireWavyRingD ?? wavefireSmoothRingD;

  /**
   * Synthesized Wavefire (e.g. one wave / two countries) still gets a ring;
   * pair arcs stay hidden whenever a ring can draw.
   */
  const wavefireRingEligible = useMemo(() => {
    if (!wavefireActive || !wavefireCluster) return false;
    return (
      wavefireCluster.connections.length >= 1 &&
      wavefireCluster.countryCodes.length >= 2
    );
  }, [wavefireActive, wavefireCluster]);

  /** Wavefire = ring + ember camps — never show raw pair arcs when eligible. */
  const showConnectionArcs = useMemo(() => {
    if (filter === "wavefire") {
      return !wavefireRingEligible || wavefireDisplayRingD == null;
    }
    if (filter === "ripplefire") {
      return !ripplefireRingEligible || ripplefireDisplayRingD == null;
    }
    if (isFireFilter(filter)) return fireActive;
    return true;
  }, [
    filter,
    wavefireRingEligible,
    wavefireDisplayRingD,
    ripplefireRingEligible,
    ripplefireDisplayRingD,
    fireActive,
  ]);

  /** Geometric centre of the Wavefire ring (projected px) + mean radius for glow. */
  const wavefireRingCentroid = useMemo(() => {
    if (!wavefireCluster) return null;
    const ordered = orderWavefireRingCountryCodes(
      wavefireCluster.countryCodes,
      projection,
    );
    if (ordered.length < 2) return null;
    const pts: { x: number; y: number }[] = [];
    for (const code of ordered) {
      const ll = centroidLonLatForAtlas(code);
      if (!ll) continue;
      const p = projection([ll[0], ll[1]]);
      if (!p) continue;
      pts.push({ x: p[0], y: p[1] });
    }
    if (pts.length < 2) return null;
    const mx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
    const my = pts.reduce((s, q) => s + q.y, 0) / pts.length;
    let ringR: number;
    if (pts.length === 2) {
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      ringR = Math.max(24, dist * 0.2);
    } else {
      ringR =
        pts.reduce((s, q) => s + Math.hypot(q.x - mx, q.y - my), 0) /
        Math.max(1, pts.length);
      ringR = Math.max(24, ringR);
    }
    return { x: mx, y: my, ringR };
  }, [wavefireCluster, projection]);

  /**
   * Soft ember stroke glow along the Wavefire ring path (`strokeWidth` scales from
   * `ringR`, comparable bulk to the former radial core ~`ringR * 0.72`).
   */
  const wavefirePathGlow = useMemo(() => {
    if (!wavefireActive || !wavefireRingCentroid) return null;
    const { ringR } = wavefireRingCentroid;
    const t = now * 0.004;
    const flick =
      0.42 +
      0.4 * (0.5 + 0.5 * Math.sin(t)) +
      0.12 * Math.sin(t * 3.2 + 0.5) +
      0.08 * Math.sin(now * 0.019);
    const baseW = Math.min(26, Math.max(8, ringR * 0.22));
    const raw: { w: number; color: string; o: number }[] = [
      { w: baseW * 1.15, color: "#7c2d12", o: 0.065 },
      { w: baseW * 0.88, color: "#ea580c", o: 0.085 },
      { w: baseW * 0.66, color: "#ea580c", o: 0.11 },
      { w: baseW * 0.46, color: "#fb923c", o: 0.14 },
      { w: baseW * 0.3, color: "#fb923c", o: 0.17 },
      { w: baseW * 0.16, color: "#fde68a", o: 0.22 },
    ];
    const layers = raw.map((L) => ({
      w: L.w,
      color: L.color,
      opacity: Math.min(0.92, Math.max(0.04, L.o * flick)),
    }));
    return { flick, layers };
  }, [wavefireActive, wavefireRingCentroid, now]);

  const firecircleTiles = useMemo(() => {
    if (!wavefireActive || !wavefireCluster) return [];
    return buildFirecircleTiles(projection, wavefireCluster.connections);
  }, [wavefireActive, wavefireCluster, projection]);

  /** Pause beach + campfire when Explore opens; resume when it closes. */
  useEffect(() => {
    if (!isTabFocused) return;

    if (fireExploreOpen) {
      void stopWavefireAmbience();
    } else {
      void startWavefireAmbience();
    }

    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background") {
        void stopWavefireAmbience();
        return;
      }
      if (s === "active" && !fireExploreOpen) {
        void startWavefireAmbience();
      }
    });
    return () => sub.remove();
  }, [isTabFocused, fireExploreOpen]);

  useEffect(() => {
    if (!wfPhotoTile) {
      setWfPhotoUri(null);
      setWfPhotoLoading(false);
      return;
    }
    const inline = wfPhotoTile.thumbnailUrl?.trim() ?? "";
    if (inline.startsWith("data:") || inline.startsWith("http")) {
      setWfPhotoUri(inline);
      setWfPhotoLoading(false);
      return;
    }
    if (inline && isTrustedFirecircleThumbUrl(inline)) {
      setWfPhotoUri(resolveFirecircleThumbUri(inline));
      setWfPhotoLoading(false);
      return;
    }
    let cancelled = false;
    setWfPhotoLoading(true);
    setWfPhotoUri(null);
    void fetchAtlasCountryPhotos(wfPhotoTile.countryCode).then((list) => {
      if (cancelled) return;
      const spotlightId = wfPhotoTile.spotlightPhotoId?.trim();
      const hit = spotlightId
        ? list.find((p) => p.id === spotlightId)
        : list[0];
      setWfPhotoUri(hit?.uri ?? null);
      setWfPhotoLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [wfPhotoTile]);

  const prevClusterConnRef = useRef<number | null>(null);
  useEffect(() => {
    if (!wavefireActive || !wavefireCluster) {
      prevClusterConnRef.current = null;
      return;
    }
    const n = wavefireCluster.connections.length;
    if (
      prevClusterConnRef.current !== null &&
      n !== prevClusterConnRef.current
    ) {
      duckFirecircleActivity();
    }
    prevClusterConnRef.current = n;
  }, [wavefireActive, wavefireCluster]);

  const stats = useMemo(() => {
    let ripples = 0;
    let waves = 0;
    for (const c of displayConnections) {
      if (c.kind === "ripple") ripples++;
      else waves++;
    }
    const countriesSet = new Set<string>();
    for (const c of displayConnections) {
      countriesSet.add(c.from);
      countriesSet.add(c.to);
    }
    return {
      countries: countriesSet.size,
      ripples,
      waves,
    };
  }, [displayConnections]);

  const formatShort = useCallback((ms: number) => {
    if (ms <= 0) return "—";
    try {
      return new Date(ms).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }, []);

  const modalStats = useMemo(() => {
    if (!modalCode) return null;
    return countryStatsFor(modalCode, displayConnections);
  }, [modalCode, displayConnections]);

  const gid = "atlasGlobeGrad";

  const oceanStops = fireNight
    ? [
        { off: "0%", col: colors.cardElevated },
        { off: "52%", col: colors.background },
        { off: "100%", col: "#030812" },
      ]
    : [
        { off: "0%", col: "#4DC4FA" },
        { off: "55%", col: colors.card },
        { off: "100%", col: colors.background },
      ];

  const landPathD = useMemo(() => atlasLandPathD(projection), [projection]);

  const continentFill = fireNight
    ? (fireVisual?.continentFill ?? "rgba(22, 60, 126, 0.92)")
    : "rgba(232, 244, 248, 0.93)";
  const continentStroke = fireNight
    ? (fireVisual?.continentStroke ?? "rgba(255, 209, 102, 0.32)")
    : "rgba(31, 169, 240, 0.15)";

  const openFireExplore = useCallback(() => {
    if (!fireActive || !effectiveFireCluster || !fireVisual) return;
    setFireExploreOpen(true);
  }, [fireActive, effectiveFireCluster, fireVisual]);

  const closeFireExplore = useCallback(() => {
    setFireExploreOpen(false);
  }, []);

  const stepFireCluster = useCallback(
    (delta: number) => {
      if (fireClusters.length <= 1) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setFireClusterIndex((idx) => {
        const n = fireClusters.length;
        return (idx + delta + n) % n;
      });
    },
    [fireClusters.length],
  );

  useEffect(() => {
    if (!fireMode) {
      setFireExploreOpen(false);
    }
  }, [fireMode]);

  return (
    <View style={[styles.card, { borderColor: colors.border }, style]}>
      <AtlasFilterBar
        filter={filter}
        isSignedIn={isSignedIn}
        onChange={setFilter}
        colors={colors}
      />

      <Text style={[styles.filterHint, { color: colors.mutedForeground }]}>
        {filter === "mine" && !isSignedIn
          ? ATLAS_FILTER_HINT_MINE_SIGNIN
          : ATLAS_FILTER_HINT[filter]}
      </Text>

      <View
        style={styles.mapArea}
        onLayout={(e) => {
          const h = Math.max(1, Math.round(e.nativeEvent.layout.height));
          mapH.value = h;
          setMapPixelH((prev) => (prev === h ? prev : h));
        }}
      >
        <GestureDetector gesture={mapGesture}>
          <View style={[styles.mapClip, { width, height: mapPixelH }]}>
            <Animated.View collapsable={false} style={animatedMapStyle}>
            <Svg
              width={canvasPixelW}
              height={canvasPixelH}
              viewBox={`0 0 ${canvasPixelW} ${canvasPixelH}`}
            >
              <Defs>
                <RadialGradient id={gid} cx="50%" cy="52%" rx="70%" ry="62%">
                  {oceanStops.map((s) => (
                    <Stop key={s.off} offset={s.off} stopColor={s.col} />
                  ))}
                </RadialGradient>
                <LinearGradient
                  id={WAVEFIRE_RING_FIRE_GRAD_ID}
                  x1="0%"
                  y1="100%"
                  x2="100%"
                  y2="0%"
                >
                  <Stop offset="0%" stopColor="#7c2d12" stopOpacity={1} />
                  <Stop offset="30%" stopColor="#ea580c" stopOpacity={1} />
                  <Stop offset="55%" stopColor="#fb923c" stopOpacity={1} />
                  <Stop offset="80%" stopColor="#fbbf24" stopOpacity={0.95} />
                  <Stop offset="100%" stopColor="#fef08a" stopOpacity={0.9} />
                </LinearGradient>
              </Defs>
              <Rect
                x={0}
                y={0}
                width={canvasPixelW}
                height={canvasPixelH}
                fill={`url(#${gid})`}
              />

              {landPathD ? (
                <Path
                  d={landPathD}
                  fill={continentFill}
                  stroke={continentStroke}
                  strokeWidth={fireNight ? 0.22 : 0.18}
                />
              ) : null}

              {fireNight && !fireActive ? (
                <G pointerEvents="none">
                  <Circle
                    cx={canvasPixelW / 2}
                    cy={canvasPixelH / 2}
                    r={Math.min(canvasPixelW, canvasPixelH) * 0.165}
                    fill="none"
                    stroke={fireVisual?.lineStroke ?? WAVEFIRE_LINE_STROKE}
                    strokeWidth={2.25}
                    strokeOpacity={
                      0.2 +
                      0.14 * (0.5 + 0.5 * Math.sin(now * 0.0022))
                    }
                    strokeDasharray="5 8"
                  />
                  <Circle
                    cx={canvasPixelW / 2}
                    cy={canvasPixelH / 2}
                    r={Math.min(canvasPixelW, canvasPixelH) * 0.184}
                    fill="none"
                    stroke={fireVisual?.emberCore ?? WAVEFIRE_EMBER_CORE}
                    strokeWidth={1.1}
                    strokeOpacity={
                      0.11 +
                      0.09 * (0.5 + 0.5 * Math.sin(now * 0.0018 + 1.1))
                    }
                    strokeDasharray="3 11"
                  />
                </G>
              ) : null}

              <G>
                {showConnectionArcs
                  ? prepared.map((p) => {
                  const age = now - parseCreatedMs(p.c);
                  const lineOp =
                    age < 0 ? 0 : Math.min(1, age / ATLAS_LINE_FADE_MS);
                  return (
                    <Path
                      key={`ln-${p.id}`}
                      d={p.d}
                      fill="none"
                      stroke={p.c.color}
                      strokeWidth={p.c.kind === "wave" ? 1 : 0.625}
                      strokeLinecap="round"
                      strokeDasharray={p.c.kind === "ripple" ? "2.5 3" : undefined}
                      opacity={0.15 + lineOp * 0.78}
                    />
                  );
                })
                  : null}
              </G>

              {wavefirePathGlow &&
              filter === "wavefire" &&
              wavefireDisplayRingD ? (
                <G pointerEvents="none">
                  {wavefirePathGlow.layers.map((layer, li) => (
                    <Path
                      key={`wf-path-glow-${li}`}
                      d={wavefireDisplayRingD}
                      fill="none"
                      stroke={layer.color}
                      strokeWidth={layer.w}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={layer.opacity}
                    />
                  ))}
                </G>
              ) : null}

              {filter === "wavefire" && wavefireDisplayRingD ? (
                <G pointerEvents="none">
                  <Path
                    d={wavefireDisplayRingD}
                    fill="none"
                    stroke={`url(#${WAVEFIRE_RING_FIRE_GRAD_ID})`}
                    strokeWidth={5.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.42}
                  />
                  <Path
                    d={wavefireDisplayRingD}
                    fill="none"
                    stroke="#7c2d12"
                    strokeWidth={2.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.55}
                  />
                  <Path
                    d={wavefireDisplayRingD}
                    fill="none"
                    stroke="#fb923c"
                    strokeWidth={1.9}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.95}
                  />
                  <Path
                    d={wavefireDisplayRingD}
                    fill="none"
                    stroke="#fde68a"
                    strokeWidth={0.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.55}
                  />
                </G>
              ) : null}

              {filter === "ripplefire" &&
              ripplefireDisplayRingD &&
              fireVisual &&
              ripplefireRingEligible ? (
                <G pointerEvents="none">
                  {fireVisual.arcGlowLayers.map((layer, li) => (
                    <Path
                      key={`rf-ring-glow-${li}`}
                      d={ripplefireDisplayRingD}
                      fill="none"
                      stroke={layer.color}
                      strokeWidth={layer.w}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={Math.min(
                        0.95,
                        layer.o * ripplefireRingGlowFlick,
                      )}
                    />
                  ))}
                  <Path
                    d={ripplefireDisplayRingD}
                    fill="none"
                    stroke={fireVisual.lineStroke}
                    strokeWidth={2.15}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.9 * ripplefireRingGlowFlick}
                  />
                  <Path
                    d={ripplefireDisplayRingD}
                    fill="none"
                    stroke={fireVisual.campSpark}
                    strokeWidth={0.9}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.48 * ripplefireRingGlowFlick}
                  />
                </G>
              ) : null}

              {filter === "wavefire" && wavefireActive && fireVisual
                ? centroidHits.map((h) => {
                    const flick =
                      0.84 +
                      0.16 *
                        (0.5 +
                          0.5 *
                            Math.sin(
                              now * 0.011 + h.code.charCodeAt(0) * 0.07,
                            ));
                    return (
                      <G key={`wf-camp-${h.code}`} pointerEvents="none">
                        <Circle
                          cx={h.cx}
                          cy={h.cy}
                          r={3.8}
                          fill={fireVisual.campGlow}
                          opacity={0.12 * flick}
                        />
                        <Circle
                          cx={h.cx}
                          cy={h.cy}
                          r={2.2}
                          fill={fireVisual.campMid}
                          opacity={0.5 * flick}
                        />
                        <Circle
                          cx={h.cx}
                          cy={h.cy}
                          r={1.35}
                          fill={fireVisual.campHot}
                          opacity={0.92 * flick}
                        />
                        <Circle
                          cx={h.cx}
                          cy={h.cy - 0.25}
                          r={0.55}
                          fill={fireVisual.campSpark}
                          opacity={0.88 * flick}
                        />
                      </G>
                    );
                  })
                : null}

              {filter === "ripplefire" && ripplefireActive && fireVisual
                ? centroidHits.map((h) => {
                    const flick =
                      0.84 +
                      0.16 *
                        (0.5 +
                          0.5 *
                            Math.sin(
                              now * 0.011 + h.code.charCodeAt(0) * 0.07,
                            ));
                    return (
                      <G key={`rf-camp-${h.code}`} pointerEvents="none">
                        <Circle
                          cx={h.cx}
                          cy={h.cy}
                          r={3.8}
                          fill={fireVisual.campGlow}
                          opacity={0.12 * flick}
                        />
                        <Circle
                          cx={h.cx}
                          cy={h.cy}
                          r={2.2}
                          fill={fireVisual.campMid}
                          opacity={0.5 * flick}
                        />
                        <Circle
                          cx={h.cx}
                          cy={h.cy}
                          r={1.35}
                          fill={fireVisual.campHot}
                          opacity={0.92 * flick}
                        />
                        <Circle
                          cx={h.cx}
                          cy={h.cy - 0.25}
                          r={0.55}
                          fill={fireVisual.campSpark}
                          opacity={0.88 * flick}
                        />
                      </G>
                    );
                  })
                : null}

              <G>
                {showConnectionArcs
                  ? animatedSlice.map((p) => {
                  const age = now - parseCreatedMs(p.c);
                  if (age < 0) return null;
                  let t = 0;
                  if (p.c.kind === "ripple") {
                    // Loop 0→1; period ATLAS_RIPPLE_TRAVEL_MS = 2× wave half (half wave speed).
                    t = (age % ATLAS_RIPPLE_TRAVEL_MS) / ATLAS_RIPPLE_TRAVEL_MS;
                  } else {
                    const cycle = ATLAS_WAVE_HALF_MS * 2;
                    const u = (age % cycle) / cycle;
                    t = u < 0.5 ? u * 2 : 2 - u * 2;
                  }
                  const pt = atlasArcPointAt(p.seg, t);
                  const isRipple = p.c.kind === "ripple";
                  const dotFill =
                    isRipple && (!p.c.color || p.c.color.length === 0)
                      ? "#4FD89C"
                      : p.c.color;
                  const dotR = 2;
                  return (
                    <Circle
                      key={`dot-${p.id}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={dotR}
                      fill={dotFill}
                      stroke="rgba(0,0,0,0)"
                      strokeWidth={0}
                      opacity={isRipple ? 1 : 0.95}
                    />
                  );
                })
                  : null}
              </G>
            </Svg>

            {wavefireActive && firecircleTiles.length > 0
              ? firecircleTiles.map((tile) => (
                  <Pressable
                    key={`wf-tile-hit-${tile.spotlightPhotoId ?? tile.countryCode}-${tile.slotIndex}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Wavefire photo for ${nameFor(tile.countryCode) ?? tile.countryCode}`}
                    onPress={() => setWfPhotoTile(tile)}
                    style={[
                      styles.hit,
                      {
                        left: tile.x - HIT_R,
                        top: tile.y - HIT_R,
                        width: HIT_R * 2,
                        height: HIT_R * 2,
                      },
                    ]}
                  />
                ))
              : null}

            {centroidHits.map((h) => (
              <Pressable
                key={`hit-${h.code}`}
                accessibilityRole="button"
                accessibilityLabel={`${nameFor(h.code) ?? h.code}, map hotspot`}
                onPress={() => setModalCode(h.code)}
                style={[
                  styles.hit,
                  {
                    left: h.cx - HIT_R,
                    top: h.cy - HIT_R,
                    width: HIT_R * 2,
                    height: HIT_R * 2,
                  },
                ]}
              />
            ))}
            </Animated.View>
          </View>
        </GestureDetector>
      </View>

      <View style={styles.atlasFooter}>
        <View style={styles.statRow}>
          <StatPill
            accessibilityLabel="Countries on map"
            value={stats.countries}
            fg={colors.foreground}
            icon="globe"
            iconColor={colors.primary}
          />
          <StatPill
            accessibilityLabel={ATLAS_FILTER_A11Y.ripples}
            value={stats.ripples}
            fg={colors.foreground}
            icon="ripple"
            iconColor="#4FD89C"
          />
          <StatPill
            accessibilityLabel={ATLAS_FILTER_A11Y.waves}
            value={stats.waves}
            fg={colors.foreground}
            icon="wave-glyph"
            iconColor="#FFD166"
          />
          {fireNight && fireVisual ? (
            <StatPill
              accessibilityLabel={fireVisual.statA11y}
              value={fireClusters.length > 0 ? fireClusters.length : effectiveFireCluster ? 1 : 0}
              fg={colors.foreground}
              icon={fireVisual.filterIcon}
              iconColor={fireVisual.lineStroke}
              onPress={fireActive ? openFireExplore : undefined}
            />
          ) : (
            <View style={styles.statPillSpacer} accessibilityElementsHidden />
          )}
        </View>

        <View style={styles.fireExploreSlot}>
          {fireActive && fireVisual && effectiveFireCluster ? (
            <FireClusterExploreBar
              visual={fireVisual}
              cluster={effectiveFireCluster}
              clusterIndex={fireClusterIndex}
              clusterCount={Math.max(fireClusters.length, 1)}
              foreground={colors.foreground}
              muted={colors.mutedForeground}
              onExplore={openFireExplore}
              onPrev={() => stepFireCluster(-1)}
              onNext={() => stepFireCluster(1)}
            />
          ) : fireNight && fireVisual && !effectiveFireCluster ? (
            <Text style={[styles.wfHint, { color: colors.mutedForeground }]}>
              {fireVisual.emptyHint}
            </Text>
          ) : null}
        </View>
      </View>

      {fireActive && effectiveFireCluster && fireVisual && fireMode ? (
        <AtlasFireExploreModal
          visible={fireExploreOpen}
          onClose={closeFireExplore}
          fireMode={fireMode}
          visual={fireVisual}
          cluster={effectiveFireCluster}
          localRippleMatches={localRippleMatches}
          localWaveEchoes={localWaveEchoes}
          viewerCountryCode={viewerCountryCode}
          viewerMyPhotos={viewerMyPhotos}
        />
      ) : null}

      <Modal
        visible={modalCode != null}
        transparent
        animationType="fade"
        onRequestClose={() => setModalCode(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setModalCode(null)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            {modalCode ? (
              <>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  {flagFor(modalCode)} {nameFor(modalCode) ?? modalCode}
                </Text>
                {modalStats ? (
                  <>
                    <Text style={[styles.modalLine, { color: colors.mutedForeground }]}>
                      {ATLAS_COUNTRY_MODAL.ripplesSent}: {modalStats.ripplesSent}
                    </Text>
                    <Text style={[styles.modalLine, { color: colors.mutedForeground }]}>
                      {ATLAS_COUNTRY_MODAL.ripplesReceived}:{" "}
                      {modalStats.ripplesReceived}
                    </Text>
                    <Text style={[styles.modalLine, { color: colors.mutedForeground }]}>
                      {ATLAS_COUNTRY_MODAL.wavesMutual}: {modalStats.waves}
                    </Text>
                    <Text style={[styles.modalLine, { color: colors.mutedForeground }]}>
                      Most recent: {formatShort(modalStats.lastMs)}
                    </Text>
                  </>
                ) : null}
                {onOpenCountryPhotos ? (
                  <Pressable
                    style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      const c = modalCode;
                      setModalCode(null);
                      if (c) onOpenCountryPhotos(c);
                    }}
                  >
                    <Text style={styles.modalBtnLabel}>View moments</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => setModalCode(null)} style={styles.modalClose}>
                  <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                    Close
                  </Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={wfPhotoTile != null}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => setWfPhotoTile(null)}
      >
        <View style={styles.wfPhotoRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close full screen photo"
            onPress={() => setWfPhotoTile(null)}
          />
          <View
            style={[
              styles.wfPhotoContent,
              {
                paddingTop: insets.top + 10,
                paddingBottom: insets.bottom + 12,
              },
            ]}
            pointerEvents="box-none"
          >
            <View style={styles.wfPhotoHeader}>
              {wfPhotoTile ? (
                <Text
                  style={[styles.wfPhotoTitle, { color: "#f8fafc" }]}
                  numberOfLines={1}
                >
                  {flagFor(wfPhotoTile.countryCode)}{" "}
                  {nameFor(wfPhotoTile.countryCode) ?? wfPhotoTile.countryCode}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                onPress={() => setWfPhotoTile(null)}
                style={styles.wfPhotoCloseBtn}
              >
                <Text style={styles.wfPhotoCloseLabel}>Close</Text>
              </Pressable>
            </View>
            <View style={styles.wfPhotoBody}>
              {wfPhotoLoading ? (
                <ActivityIndicator size="large" color="#fb923c" />
              ) : wfPhotoUri ? (
                <Image
                  source={{ uri: wfPhotoUri }}
                  style={styles.wfPhotoImage}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <Text style={[styles.wfPhotoEmpty, { color: "rgba(248,250,252,0.72)" }]}>
                  No photo for this country on the map yet.
                </Text>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FireClusterExploreBar({
  visual,
  cluster,
  clusterIndex,
  clusterCount,
  foreground,
  muted,
  onExplore,
  onPrev,
  onNext,
}: {
  visual: AtlasFireVisual;
  cluster: AtlasThemeCluster;
  clusterIndex: number;
  clusterCount: number;
  foreground: string;
  muted: string;
  onExplore: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const multi = clusterCount > 1;
  const themeLabel = cluster.displayTheme.trim();
  const counter = `${clusterIndex + 1} / ${clusterCount}`;

  return (
    <View style={styles.fireExploreRow}>
      {multi ? (
        <PressableScale
          onPress={onPrev}
          haptic="light"
          android_ripple={{ color: "transparent" }}
          accessibilityRole="button"
          accessibilityLabel={`Previous ${visual.label}`}
          style={[
            styles.fireNavBtn,
            {
              backgroundColor: visual.chipActiveBg,
              borderColor: visual.lineStroke,
            },
          ]}
        >
          <Icon name="chevron-left" size={22} color={visual.lineStroke} />
        </PressableScale>
      ) : (
        <View style={styles.fireNavSpacer} />
      )}

      <PressableScale
        onPress={onExplore}
        haptic="medium"
        accessibilityRole="button"
        accessibilityLabel={
          multi
            ? `Explore ${visual.label}, ${themeLabel || "cluster"}, ${counter}`
            : `Explore ${visual.label}`
        }
        android_ripple={{ color: "transparent" }}
        style={[
          styles.fireExploreCta,
          {
            backgroundColor: visual.chipActiveBg,
            borderColor: visual.lineStroke,
          },
        ]}
      >
        <View style={styles.fireExploreCtaTop}>
          <Icon name={visual.filterIcon} size={18} color={visual.lineStroke} />
          <Text style={[styles.fireExploreCtaTitle, { color: foreground }]}>
            Explore {visual.label}
          </Text>
          <Icon name="chevron-right" size={18} color={visual.lineStroke} />
        </View>
        {themeLabel ? (
          <Text
            style={[styles.fireExploreCtaTheme, { color: muted }]}
            numberOfLines={1}
          >
            {themeLabel}
          </Text>
        ) : null}
        {multi ? (
          <View
            style={[
              styles.fireExploreCounter,
              { borderColor: visual.lineStroke + "88" },
            ]}
          >
            <Text
              style={[styles.fireExploreCounterText, { color: visual.lineStroke }]}
            >
              {counter}
            </Text>
          </View>
        ) : null}
      </PressableScale>

      {multi ? (
        <PressableScale
          onPress={onNext}
          haptic="light"
          android_ripple={{ color: "transparent" }}
          accessibilityRole="button"
          accessibilityLabel={`Next ${visual.label}`}
          style={[
            styles.fireNavBtn,
            {
              backgroundColor: visual.chipActiveBg,
              borderColor: visual.lineStroke,
            },
          ]}
        >
          <Icon name="chevron-right" size={22} color={visual.lineStroke} />
        </PressableScale>
      ) : (
        <View style={styles.fireNavSpacer} />
      )}
    </View>
  );
}

function StatPill(props: {
  value: number;
  fg: string;
  accessibilityLabel: string;
  icon: IconName;
  iconColor: string;
  onPress?: () => void;
}) {
  const inner = (
    <>
      <Icon name={props.icon} size={14} color={props.iconColor} />
      <Text style={[styles.statVal, { color: props.fg }]}>{props.value}</Text>
    </>
  );
  if (props.onPress) {
    return (
      <Pressable
        onPress={props.onPress}
        style={styles.statPill}
        accessibilityRole="button"
        accessibilityLabel={`${props.accessibilityLabel}: ${props.value}. Open explorer.`}
      >
        {inner}
      </Pressable>
    );
  }
  return (
    <View
      style={styles.statPill}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${props.accessibilityLabel}: ${props.value}`}
    >
      {inner}
    </View>
  );
}

function AtlasFilterBar(props: {
  filter: AtlasFilterMode;
  isSignedIn: boolean;
  onChange: (m: AtlasFilterMode) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const mainModes: Array<{
    id: AtlasFilterMode;
    label: string;
    filterIcon?: IconName;
    filterIconColor?: string;
    filterA11y: string;
  }> = [
    { id: "all", label: "All", filterA11y: "All connections" },
    {
      id: "ripples",
      label: "",
      filterIcon: "ripple",
      filterIconColor: "#4FD89C",
      filterA11y: "Ripples only",
    },
    {
      id: "waves",
      label: "",
      filterIcon: "wave-glyph",
      filterIconColor: "#FFD166",
      filterA11y: "Waves only",
    },
    { id: "mine", label: "My activity", filterA11y: "My activity" },
  ];
  const rf = {
    id: "ripplefire" as const,
    labelTop: "Ripple",
    labelBottom: "fire",
    visual: atlasFireVisual("ripplefire"),
  };
  const wf = {
    id: "wavefire" as const,
    labelTop: "Wave",
    labelBottom: "fire",
    visual: atlasFireVisual("wavefire"),
  };
  const standardChip = (active: boolean) => ({
    backgroundColor: active
      ? "rgba(56,189,248,0.35)"
      : "rgba(0,16,24,0.45)",
    borderColor: active ? props.colors.primary : "rgba(255,255,255,0.12)",
    borderWidth: 1,
  });
  const fireChip = (active: boolean, visual: AtlasFireVisual) => ({
    backgroundColor: active ? visual.chipActiveBg : visual.chipIdleBg,
    borderColor: active ? visual.chipActiveBorder : visual.chipIdleBorder,
    borderWidth: active ? 2 : 1,
  });
  const fireChipShadow = (active: boolean, visual: AtlasFireVisual) =>
    Platform.OS === "ios"
      ? {
          shadowColor: visual.chipShadowColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: active ? 0.72 : 0.45,
          shadowRadius: active ? 16 : 10,
        }
      : null;
  return (
    <View style={styles.filterBar}>
      <View style={styles.filterChipsRow}>
        {mainModes.map((m) => {
          const active = props.filter === m.id;
          const disabled = m.id === "mine" && !props.isSignedIn;
          return (
            <Pressable
              key={m.id}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={m.filterA11y}
              onPress={() => props.onChange(m.id)}
              style={[
                styles.filterChip,
                m.filterIcon ? styles.filterChipIconOnly : null,
                standardChip(active),
                { opacity: disabled ? 0.38 : 1 },
              ]}
            >
              {m.filterIcon ? (
                <Icon
                  name={m.filterIcon}
                  size={16}
                  color={
                    active ? "#fff" : m.filterIconColor ?? props.colors.foreground
                  }
                />
              ) : null}
              {m.label ? (
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: active ? "#fff" : props.colors.foreground,
                    },
                  ]}
                >
                  {m.label}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.fireChipsRow}>
        {[rf, wf].map((chip) => {
          const active = props.filter === chip.id;
          return (
            <View
              key={chip.id}
              style={[
                styles.fireChipWrap,
                styles.wavefireEmberGlowWrap,
                active
                  ? styles.wavefireEmberGlowWrapActive
                  : styles.wavefireEmberGlowWrapIdle,
                {
                  backgroundColor: active
                    ? chip.visual.chipActiveBg
                    : chip.visual.chipIdleBg,
                  borderColor: active
                    ? chip.visual.chipActiveBorder
                    : chip.visual.chipIdleBorder,
                },
                fireChipShadow(active, chip.visual),
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={chip.visual.statA11y}
                onPress={() => props.onChange(chip.id)}
                style={[
                  styles.filterFireChip,
                  fireChip(active, chip.visual),
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.filterFireChipText,
                    {
                      color: active ? "#fff" : props.colors.foreground,
                    },
                  ]}
                >
                  {chip.labelTop}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.filterFireChipText,
                    {
                      color: active ? "#fff" : props.colors.foreground,
                    },
                  ]}
                >
                  {chip.labelBottom}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 22,
    paddingTop: 8,
    paddingBottom: 8,
    overflow: "hidden",
    flex: 1,
    minHeight: 0,
  },
  mapArea: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  filterChipsRow: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  fireChipsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
    flexShrink: 0,
  },
  fireChipWrap: {
    width: 84,
    flexShrink: 0,
  },
  mineHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 16,
    paddingTop: 2,
    marginBottom: 8,
    minHeight: 52,
  },
  atlasFooter: {
    flexShrink: 0,
  },
  fireExploreSlot: {
    minHeight: 88,
    justifyContent: "center",
    paddingHorizontal: 12,
    marginTop: 4,
  },
  fireExploreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fireNavSpacer: {
    width: 44,
    height: 44,
  },
  fireNavBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  fireExploreCta: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
    overflow: "hidden",
  },
  fireExploreCtaTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  fireExploreCtaTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    flexShrink: 1,
    textAlign: "center",
  },
  fireExploreCtaTheme: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: 4,
  },
  fireExploreCounter: {
    alignSelf: "center",
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  fireExploreCounterText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.3,
  },
  statPillSpacer: {
    minWidth: 88,
    height: 32,
    opacity: 0,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterChipIconOnly: {
    width: 40,
    height: 40,
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  wavefireEmberGlowWrap: {
    borderRadius: 14,
    padding: 2,
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
  },
  wavefireEmberGlowWrapIdle: {
    backgroundColor: "rgba(255, 107, 53, 0.1)",
    borderColor: "rgba(255, 107, 53, 0.32)",
  },
  wavefireEmberGlowWrapActive: {
    backgroundColor: "rgba(251, 146, 60, 0.22)",
    borderColor: "rgba(255, 180, 120, 0.55)",
  },
  filterFireChip: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    width: "100%",
  },
  filterChipText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  filterFireChipText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    lineHeight: 15,
    textAlign: "center",
  },
  mapClip: {
    alignSelf: "center",
    position: "relative",
    borderRadius: 18,
    overflow: "hidden",
  },
  hit: {
    position: "absolute",
    borderRadius: 999,
  },
  statRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,16,24,0.5)",
  },
  statVal: { fontFamily: "Inter_700Bold", fontSize: 13 },
  wfHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  wfThemeCard: {
    marginHorizontal: 12,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
    gap: 4,
  },
  wfThemeLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  wfThemeValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    lineHeight: 21,
  },
  wfThemeMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    borderRadius: 16,
    padding: 18,
    gap: 8,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    marginBottom: 4,
  },
  modalLine: { fontFamily: "Inter_400Regular", fontSize: 14 },
  modalBtn: {
    marginTop: 10,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalBtnLabel: {
    fontFamily: "Inter_600SemiBold",
    color: "#001018",
    fontSize: 15,
  },
  modalClose: { alignSelf: "center", marginTop: 6, padding: 8 },
  wfPhotoRoot: {
    flex: 1,
    backgroundColor: "rgba(0,8,16,0.94)",
  },
  wfPhotoContent: {
    flex: 1,
    zIndex: 1,
  },
  wfPhotoHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
  },
  wfPhotoTitle: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  wfPhotoCloseBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  wfPhotoCloseLabel: {
    fontFamily: "Inter_600SemiBold",
    color: "#fb923c",
    fontSize: 16,
  },
  wfPhotoBody: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    minHeight: 200,
  },
  wfPhotoImage: {
    width: "100%",
    flex: 1,
    maxHeight: 560,
  },
  wfPhotoEmpty: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    textAlign: "center",
    paddingHorizontal: 20,
  },
});
