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
} from "@/utils/api";
import { flagFor, nameFor } from "@/data/countries";
import { FirecircleOrbit } from "@/components/FirecircleOrbit";
import { Icon, type IconName } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import {
  atlasArcPathD,
  atlasArcPointAt,
  atlasArcSegment,
  createAtlasProjection,
} from "@/utils/atlasArcPath";
import { centroidLonLatForAtlas } from "@/utils/atlasCountryCentroids";
import {
  detectWavefireCluster,
  orderWavefireRingCountryCodes,
} from "@/utils/atlasWavefire";
import { atlasLandPathD } from "@/utils/atlasWorldLand";
import {
  duckFirecircleActivity,
  setFirecircleMapScale,
} from "@/utils/firecircleAudio";
import { layoutFirecircleTiles } from "@/utils/firecircleLayout";
import { pickFirecircleParticipants } from "@/utils/firecircleParticipants";
import {
  startWavefireAmbience,
  stopWavefireAmbience,
} from "@/utils/wavefireAmbience";

export type AtlasFilterMode = "all" | "ripples" | "waves" | "mine" | "wavefire";

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
const WAVEFIRE_WINDOW_MS = 6 * 60 * 60 * 1000;
const WAVEFIRE_MIN_EVENTS = 3;
const WAVEFIRE_MIN_COUNTRIES = 3;
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
  if (ordered.length < 3) {
    return null;
  }
  const k = WAVEFIRE_RING_SAMPLES_PER_LEG;
  const base: { x: number; y: number }[] = [];
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
  /** Globe draws only `wavefireCluster.connections`; keep base empty so nothing leaks. */
  if (mode === "wavefire") return [];
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
  /** When set, country modal shows "View moments". */
  onOpenCountryPhotos?: (code: string) => void;
  style?: StyleProp<ViewStyle>;
}

export function AtlasGlobeExperience({
  width,
  connections,
  countries,
  isSignedIn,
  onOpenCountryPhotos,
  style,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [mapPixelH, setMapPixelH] = useState(ATLAS_MAP_FALLBACK_H);
  const [wfPhotoCountry, setWfPhotoCountry] = useState<string | null>(null);
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

  const [filter, setFilter] = useState<AtlasFilterMode>("all");
  const [modalCode, setModalCode] = useState<string | null>(null);

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

  const wavefireCluster = useMemo(
    () =>
      detectWavefireCluster(
        normalized,
        WAVEFIRE_WINDOW_MS,
        WAVEFIRE_MIN_EVENTS,
        WAVEFIRE_MIN_COUNTRIES,
      ),
    [normalized],
  );

  const baseFiltered = useMemo(
    () => filterConnections(normalized, filter, isSignedIn),
    [normalized, filter, isSignedIn],
  );

  const displayConnections = useMemo(() => {
    if (filter !== "wavefire") return baseFiltered;
    if (!wavefireCluster) return [];
    return wavefireCluster.connections;
  }, [filter, baseFiltered, wavefireCluster]);

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
    if (filter === "wavefire") {
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
    if (filter === "wavefire") {
      return wavefireCluster?.countryCodes ?? [];
    }
    return countryCodesOnMap;
  }, [filter, wavefireCluster, countryCodesOnMap]);

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
  const wavefireNight = filter === "wavefire";
  const wavefireActive = wavefireNight && wavefireCluster != null;

  const wavefireRingSegments = useMemo(() => {
    if (!wavefireActive || !wavefireCluster) return [];
    const ordered = orderWavefireRingCountryCodes(
      wavefireCluster.countryCodes,
      projection,
    );
    if (ordered.length < 3) return [];
    const parts: string[] = [];
    for (let i = 0; i < ordered.length; i++) {
      const a = centroidLonLatForAtlas(ordered[i]!);
      const b = centroidLonLatForAtlas(ordered[(i + 1) % ordered.length]!);
      if (!a || !b) continue;
      const d = atlasArcPathD(projection, a, b);
      if (d) parts.push(d);
    }
    return parts;
  }, [wavefireActive, wavefireCluster, projection]);

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

  /** Geometric centre of the Wavefire country ring (projected px) + mean radius. */
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
    const ringR =
      pts.reduce((s, q) => s + Math.hypot(q.x - mx, q.y - my), 0) /
      Math.max(1, pts.length);
    return { x: mx, y: my, ringR: Math.max(24, ringR) };
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
    const baseW = Math.max(20, ringR * 0.72);
    const raw: { w: number; color: string; o: number }[] = [
      { w: baseW * 1.25, color: "#7c2d12", o: 0.075 },
      { w: baseW * 0.98, color: "#ea580c", o: 0.095 },
      { w: baseW * 0.74, color: "#ea580c", o: 0.12 },
      { w: baseW * 0.52, color: "#fb923c", o: 0.15 },
      { w: baseW * 0.34, color: "#fb923c", o: 0.19 },
      { w: baseW * 0.18, color: "#fde68a", o: 0.24 },
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
    const participants = pickFirecircleParticipants(
      wavefireCluster.connections,
    );
    return layoutFirecircleTiles(
      projection,
      wavefireCluster.countryCodes,
      participants,
    );
  }, [wavefireActive, wavefireCluster, projection]);

  useEffect(() => {
    if (!wavefireActive) {
      void stopWavefireAmbience();
      return;
    }
    void startWavefireAmbience();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background") {
        void stopWavefireAmbience();
        return;
      }
      if (s === "active" && filter === "wavefire" && wavefireCluster) {
        void startWavefireAmbience();
      }
    });
    return () => {
      sub.remove();
      void stopWavefireAmbience();
    };
  }, [wavefireActive, filter, wavefireCluster]);

  useEffect(() => {
    if (!wfPhotoCountry) {
      setWfPhotoUri(null);
      setWfPhotoLoading(false);
      return;
    }
    let cancelled = false;
    setWfPhotoLoading(true);
    setWfPhotoUri(null);
    void fetchAtlasCountryPhotos(wfPhotoCountry).then((list) => {
      if (cancelled) return;
      setWfPhotoLoading(false);
      setWfPhotoUri(list[0]?.uri ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [wfPhotoCountry]);

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

  const oceanStops = wavefireNight
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

  const continentFill = wavefireNight
    ? "rgba(22, 60, 126, 0.92)"
    : "rgba(232, 244, 248, 0.93)";
  const continentStroke = wavefireNight
    ? "rgba(255, 209, 102, 0.32)"
    : "rgba(31, 169, 240, 0.15)";

  const centroidDotFill = wavefireNight
    ? "rgba(255, 209, 102, 0.42)"
    : "rgba(31, 169, 240, 0.55)";
  const centroidDotOpacity = wavefireNight ? 0.85 : 0.42;

  return (
    <View style={[styles.card, { borderColor: colors.border }, style]}>
      <AtlasFilterBar
        filter={filter}
        isSignedIn={isSignedIn}
        onChange={setFilter}
        colors={colors}
      />

      {filter === "mine" && !isSignedIn ? (
        <Text style={[styles.mineHint, { color: colors.mutedForeground }]}>
          Sign in to see only your ripples and waves on the map.
        </Text>
      ) : null}

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
                  strokeWidth={wavefireNight ? 0.22 : 0.18}
                />
              ) : null}

              {wavefireNight && !wavefireActive ? (
                <G pointerEvents="none">
                  <Circle
                    cx={canvasPixelW / 2}
                    cy={canvasPixelH / 2}
                    r={Math.min(canvasPixelW, canvasPixelH) * 0.165}
                    fill="none"
                    stroke={WAVEFIRE_LINE_STROKE}
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
                    stroke={WAVEFIRE_EMBER_CORE}
                    strokeWidth={1.1}
                    strokeOpacity={
                      0.11 +
                      0.09 * (0.5 + 0.5 * Math.sin(now * 0.0018 + 1.1))
                    }
                    strokeDasharray="3 11"
                  />
                </G>
              ) : null}

              {centroidHits.map((h) => (
                <Circle
                  key={`dot-${h.code}`}
                  cx={h.cx}
                  cy={h.cy}
                  r={wavefireNight ? 2.5 : 1.6}
                  fill={centroidDotFill}
                  opacity={centroidDotOpacity}
                />
              ))}

              <G>
                {!wavefireActive
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
              (wavefireWavyRingD || wavefireRingSegments.length > 0) ? (
                <G pointerEvents="none">
                  {wavefireWavyRingD
                    ? wavefirePathGlow.layers.map((layer, li) => (
                        <Path
                          key={`wf-path-glow-${li}`}
                          d={wavefireWavyRingD}
                          fill="none"
                          stroke={layer.color}
                          strokeWidth={layer.w}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={layer.opacity}
                        />
                      ))
                    : wavefireRingSegments.flatMap((d, si) =>
                        wavefirePathGlow.layers.map((layer, li) => (
                          <Path
                            key={`wf-seg-glow-${si}-${li}`}
                            d={d}
                            fill="none"
                            stroke={layer.color}
                            strokeWidth={layer.w}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={layer.opacity}
                          />
                        )),
                      )}
                </G>
              ) : null}

              {wavefireWavyRingD ? (
                <G pointerEvents="none">
                  <Path
                    d={wavefireWavyRingD}
                    fill="none"
                    stroke={`url(#${WAVEFIRE_RING_FIRE_GRAD_ID})`}
                    strokeWidth={5.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.42}
                  />
                  <Path
                    d={wavefireWavyRingD}
                    fill="none"
                    stroke="#7c2d12"
                    strokeWidth={2.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.55}
                  />
                  <Path
                    d={wavefireWavyRingD}
                    fill="none"
                    stroke="#fb923c"
                    strokeWidth={1.9}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.95}
                  />
                  <Path
                    d={wavefireWavyRingD}
                    fill="none"
                    stroke="#fde68a"
                    strokeWidth={0.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.55}
                  />
                </G>
              ) : wavefireRingSegments.length > 0 ? (
                <G pointerEvents="none">
                  {wavefireRingSegments.map((d, i) => (
                    <G key={`wf-ring-${i}`}>
                      <Path
                        d={d}
                        fill="none"
                        stroke={WAVEFIRE_EMBER_CORE}
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={0.22}
                      />
                      <Path
                        d={d}
                        fill="none"
                        stroke={WAVEFIRE_LINE_STROKE}
                        strokeWidth={1.375}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={0.96}
                      />
                    </G>
                  ))}
                </G>
              ) : null}

              <G>
                {!wavefireActive
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

            {wavefireActive && firecircleTiles.length > 0 ? (
              <FirecircleOrbit
                tiles={firecircleTiles}
                mapScale={scale}
                onSelectCountry={(code) => setWfPhotoCountry(code)}
              />
            ) : null}

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

      <View style={styles.statRow}>
        <StatPill
          accessibilityLabel="Countries on map"
          value={stats.countries}
          fg={colors.foreground}
          icon="globe"
          iconColor={colors.primary}
        />
        <StatPill
          accessibilityLabel="Ripples"
          value={stats.ripples}
          fg={colors.foreground}
          icon="ripple"
          iconColor="#4FD89C"
        />
        <StatPill
          accessibilityLabel="Waves"
          value={stats.waves}
          fg={colors.foreground}
          icon="wave-glyph"
          iconColor="#FFD166"
        />
        {wavefireNight ? (
          <StatPill
            accessibilityLabel="Wavefire clusters"
            value={wavefireActive ? 1 : 0}
            fg={colors.foreground}
            icon="campfire"
            iconColor={WAVEFIRE_LINE_STROKE}
          />
        ) : null}
      </View>

      {wavefireNight && wavefireActive && wavefireCluster ? (
        <View
          style={[
            styles.wfThemeCard,
            {
              borderColor: colors.border,
              backgroundColor: colors.card,
              borderLeftColor: WAVEFIRE_LINE_STROKE,
            },
          ]}
        >
          <Text style={[styles.wfThemeLabel, { color: colors.mutedForeground }]}>
            Same echo
          </Text>
          <Text
            style={[styles.wfThemeValue, { color: colors.foreground }]}
            numberOfLines={5}
          >
            {wavefireCluster.displayTheme}
          </Text>
          <Text style={[styles.wfThemeMeta, { color: colors.mutedForeground }]}>
            {wavefireCluster.connections.length} moments ·{" "}
            {wavefireCluster.countryCodes.length} countries
          </Text>
        </View>
      ) : null}

      {wavefireNight && !wavefireCluster ? (
        <Text style={[styles.wfHint, { color: colors.mutedForeground }]}>
          No active Wavefire — similar moments across countries in the last few
          hours. Enter the circle. Let the fire speak.
        </Text>
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
                      Ripples sent: {modalStats.ripplesSent}
                    </Text>
                    <Text style={[styles.modalLine, { color: colors.mutedForeground }]}>
                      Ripples received: {modalStats.ripplesReceived}
                    </Text>
                    <Text style={[styles.modalLine, { color: colors.mutedForeground }]}>
                      Waves (mutual): {modalStats.waves}
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
        visible={wfPhotoCountry != null}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => setWfPhotoCountry(null)}
      >
        <View style={styles.wfPhotoRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close full screen photo"
            onPress={() => setWfPhotoCountry(null)}
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
              {wfPhotoCountry ? (
                <Text
                  style={[styles.wfPhotoTitle, { color: "#f8fafc" }]}
                  numberOfLines={1}
                >
                  {flagFor(wfPhotoCountry)}{" "}
                  {nameFor(wfPhotoCountry) ?? wfPhotoCountry}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                onPress={() => setWfPhotoCountry(null)}
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

function StatPill(props: {
  value: number;
  fg: string;
  accessibilityLabel: string;
  icon: IconName;
  iconColor: string;
}) {
  return (
    <View
      style={styles.statPill}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${props.accessibilityLabel}: ${props.value}`}
    >
      <Icon name={props.icon} size={14} color={props.iconColor} />
      <Text style={[styles.statVal, { color: props.fg }]}>{props.value}</Text>
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
  const wf = {
    id: "wavefire" as const,
    label: "Wavefire",
  };
  const standardChip = (active: boolean) => ({
    backgroundColor: active
      ? "rgba(56,189,248,0.35)"
      : "rgba(0,16,24,0.45)",
    borderColor: active ? props.colors.primary : "rgba(255,255,255,0.12)",
    borderWidth: 1,
  });
  const wavefireChip = (active: boolean) => ({
    ...standardChip(active),
    borderColor: active
      ? WAVEFIRE_LINE_STROKE
      : "rgba(255, 107, 53, 0.42)",
    borderWidth: active ? 2 : 1,
  });
  return (
    <View style={styles.filterRow}>
      <View style={styles.filterChipsLeft}>
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
      <View
        style={[
          styles.wavefireEmberGlowWrap,
          props.filter === wf.id
            ? styles.wavefireEmberGlowWrapActive
            : styles.wavefireEmberGlowWrapIdle,
          Platform.OS === "ios"
            ? props.filter === wf.id
              ? WAVEFIRE_CHIP_SHADOW_IOS_ACTIVE
              : WAVEFIRE_CHIP_SHADOW_IOS_IDLE
            : null,
        ]}
      >
        <Pressable
          onPress={() => props.onChange(wf.id)}
          style={[
            styles.filterWavefireChip,
            wavefireChip(props.filter === wf.id),
          ]}
        >
          <Text
            style={[
              styles.filterChipText,
              styles.filterWavefireChipText,
              {
                color:
                  props.filter === wf.id ? "#fff" : props.colors.foreground,
              },
            ]}
          >
            {wf.label}
          </Text>
        </Pressable>
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
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  filterChipsLeft: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  mineHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 16,
    marginBottom: 8,
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
  filterWavefireChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 62,
    borderRadius: 12,
    borderWidth: 1,
    flexShrink: 0,
  },
  filterChipText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  filterWavefireChipText: {
    fontSize: 13,
    lineHeight: 18,
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
