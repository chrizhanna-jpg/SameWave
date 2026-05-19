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
 * - **Ripple:** user tapped Same; waiting for reciprocation. **Wave:** both Rippled
 *   back (server `mutual`). Atlas `kind` matches that split.
 * - **Wavefire:** clusters of **waves** only. **Ripplefire:** clusters of **ripples**
 *   only. See `data/waveRippleGlossary.ts` for user-facing definitions.
 * - **Zoom / pan:** one-finger drag pans; pinch zooms with focal anchoring
 *   (`tx' = fx - (s'/s)(fx - tx)`). Transform is translate then scale with
 *   `transformOrigin` top-left. Translate is clamped using **scaled** canvas size
 *   (`vw - cw*s` … `0`) so the map cannot slide off into empty space; double-tap
 *   resets translate + scale.
 * - **Performance:** cap `ATLAS_MAX_ANIMATED_CONNECTIONS` on **moving dots**
 *   (ripples are prioritized so their green dots are not dropped when many
 *   waves exist); extra arcs still render but may skip dots.
 */
import { useFocusEffect } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
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
import {
  type AtlasConnection,
  type AtlasCountry,
  type LocalRippleExploreMatch,
  type ViewerExplorePhoto,
  type LocalWaveExploreEcho,
} from "@/utils/api";
import { flagFor, nameFor } from "@/data/countries";
import { AtlasFireExploreModal } from "@/components/AtlasFireExploreModal";
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
  connectionsInFireWindow,
  detectRipplefireClusters,
  detectWavefireClusters,
  orderWavefireRingCountryCodes,
  type AtlasThemeCluster,
} from "@/utils/atlasWavefire";
import {
  ATLAS_FIRE_WINDOW_MS,
  RIPPLEFIRE_MIN_COUNTRIES,
  RIPPLEFIRE_MIN_EVENTS,
  WAVEFIRE_MIN_COUNTRIES,
  WAVEFIRE_MIN_EVENTS,
} from "@/utils/atlasFireConfig";
import { PressableScale } from "@/components/PressableScale";
import * as Haptics from "expo-haptics";
import {
  ATLAS_COUNTRY_MODAL,
  ATLAS_FILTER_A11Y,
} from "@/data/waveRippleGlossary";
import {
  atlasFireVisual,
  RIPPLEFIRE_VISUAL,
  WAVEFIRE_VISUAL,
  type AtlasFireMode,
  type AtlasFireVisual,
} from "@/utils/atlasFireVisuals";
import { atlasLandPathD } from "@/utils/atlasWorldLand";
import {
  setWavefireMapScale,
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

function atlasFireModeFromFilter(
  mode: AtlasFilterMode,
): AtlasFireMode | null {
  if (mode === "wavefire" || mode === "ripplefire") return mode;
  return null;
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
  /** Globe draws only theme-cluster connections; keep base empty so nothing leaks. */
  if (mode === "wavefire" || mode === "ripplefire") return [];
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
/** Default pinch ceiling — raised so users can zoom in further on country detail. */
const ATLAS_MAX_ZOOM = 7.5;
/** Map loads 20% closer than the previous default (1.0). */
const ATLAS_INITIAL_ZOOM = 1.2;
const ATLAS_MAP_FALLBACK_H = 280;

/** Center the oversampled canvas in the viewport at scale `s` (JS + worklet safe). */
function centerAtlasMapPan(
  vw: number,
  vh: number,
  cw: number,
  ch: number,
  s: number,
): { x: number; y: number } {
  const px = vw / 2 - (cw * s) / 2;
  const py = vh / 2 - (ch * s) / 2;
  return clampAtlasMapPan(px, py, vw, vh, cw, ch, s);
}

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
function fireChipShadowIos(visual: AtlasFireVisual, active: boolean): ViewStyle {
  return {
    shadowColor: visual.chipShadowColor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: active ? 0.55 : 0.32,
    shadowRadius: active ? 14 : 9,
  };
}

interface Props {
  width: number;
  connections: AtlasConnection[];
  countries: AtlasCountry[];
  isSignedIn: boolean;
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
  onOpenCountryPhotos,
  localRippleMatches,
  localWaveEchoes,
  viewerCountryCode,
  viewerMyPhotos,
  style,
}: Props) {
  const colors = useColors();
  const [mapPixelH, setMapPixelH] = useState(ATLAS_MAP_FALLBACK_H);

  const mapW = useSharedValue(width);
  const mapH = useSharedValue(ATLAS_MAP_FALLBACK_H);
  const canvasW = useSharedValue(width * ATLAS_MAP_OVERSAMPLE);
  const canvasH = useSharedValue(ATLAS_MAP_FALLBACK_H * ATLAS_MAP_OVERSAMPLE);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const scale = useSharedValue(ATLAS_INITIAL_ZOOM);
  const pinchBase = useSharedValue(ATLAS_INITIAL_ZOOM);
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
    const s = ATLAS_INITIAL_ZOOM;
    scale.value = s;
    pinchBase.value = s;
    const c = centerAtlasMapPan(width, mapPixelH, cw, ch, s);
    panX.value = c.x;
    panY.value = c.y;
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

  const syncWavefireZoom = useCallback((v: number) => {
    setWavefireMapScale(v);
  }, []);

  useAnimatedReaction(
    () => scale.value,
    (v, prev) => {
      if (prev === null) {
        runOnJS(syncWavefireZoom)(v);
        return;
      }
      if (Math.abs(v - prev) > 0.03) {
        runOnJS(syncWavefireZoom)(v);
      }
    },
    [syncWavefireZoom],
  );

  const mapPinch = Gesture.Pinch()
    .onBegin(() => {
      pinchBase.value = scale.value;
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
      const vw = mapW.value;
      const vh = mapH.value;
      const cw = canvasW.value;
      const ch = canvasH.value;
      const s = ATLAS_INITIAL_ZOOM;
      const c = centerAtlasMapPan(vw, vh, cw, ch, s);
      panX.value = withTiming(c.x, { duration: 220 });
      panY.value = withTiming(c.y, { duration: 220 });
      scale.value = withTiming(s, { duration: 220 });
    });

  const mapGesture = Gesture.Simultaneous(mapPinch, mapPan, mapDoubleTap);

  const [filter, setFilter] = useState<AtlasFilterMode>("ripplefire");
  const [modalCode, setModalCode] = useState<string | null>(null);
  const [fireExploreOpen, setFireExploreOpen] = useState(false);
  const [fireClusterIndex, setFireClusterIndex] = useState(0);
  const [atlasTabFocused, setAtlasTabFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setAtlasTabFocused(true);
      return () => setAtlasTabFocused(false);
    }, []),
  );

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

  const fireMode = atlasFireModeFromFilter(filter);
  const fireVisual = fireMode ? atlasFireVisual(fireMode) : null;
  const fireClusters =
    fireMode === "wavefire"
      ? wavefireClusters
      : fireMode === "ripplefire"
        ? ripplefireClusters
        : [];

  useEffect(() => {
    setFireClusterIndex(0);
  }, [filter]);

  useEffect(() => {
    setFireClusterIndex((idx) => {
      if (fireClusters.length === 0) return 0;
      return Math.min(idx, fireClusters.length - 1);
    });
  }, [fireClusters]);

  const fireCluster: AtlasThemeCluster | null =
    fireClusters[fireClusterIndex] ?? null;

  const baseFiltered = useMemo(
    () => filterConnections(normalized, filter, isSignedIn),
    [normalized, filter, isSignedIn],
  );

  const displayConnections = useMemo(() => {
    if (!fireMode) return baseFiltered;
    // Ripplefire / Wavefire: draw every active arc globally; cluster picker
    // only chooses which themed group opens in Explore (prev/next).
    if (fireMode === "ripplefire") {
      return connectionsInFireWindow(
        normalized,
        ATLAS_FIRE_WINDOW_MS,
        "ripple",
      );
    }
    if (fireMode === "wavefire") {
      return connectionsInFireWindow(
        normalized,
        ATLAS_FIRE_WINDOW_MS,
        "wave",
      );
    }
    if (!fireCluster) return [];
    return fireCluster.connections;
  }, [fireMode, baseFiltered, fireCluster, normalized]);

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
    if (fireMode) {
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
  }, [countries, displayConnections, fireMode]);

  const mapCountryCodes = useMemo(() => {
    if (fireMode) {
      return fireCluster?.countryCodes ?? [];
    }
    return countryCodesOnMap;
  }, [fireMode, fireCluster, countryCodesOnMap]);

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
  const fireNight = fireMode != null;
  const fireActive = fireNight && fireCluster != null;
  const fireAmbienceOn = fireNight && atlasTabFocused;
  const fireAmbienceOnRef = useRef(fireAmbienceOn);
  fireAmbienceOnRef.current = fireAmbienceOn;

  /** Country centroids ordered as one closed ring around the active cluster. */
  const fireRing = useMemo((): {
    points: AtlasScreenPoint[];
    codes: string[];
  } | null => {
    if (!fireActive || !fireCluster) return null;
    const codes = orderWavefireRingCountryCodes(
      fireCluster.countryCodes,
      projection,
    );
    const points: AtlasScreenPoint[] = [];
    for (const code of codes) {
      const ll = centroidLonLatForAtlas(code);
      if (!ll) continue;
      const p = projection([ll[0], ll[1]]);
      if (!p) continue;
      points.push({ x: p[0], y: p[1] });
    }
    if (points.length < 2) return null;
    return { points, codes };
  }, [fireActive, fireCluster, projection]);

  /** Ember pulse on the glowing ring between countries. */
  const fireArcGlowFlick = useMemo(() => {
    if (!fireActive) return 1;
    const t = now * 0.004;
    return (
      0.78 +
      0.17 * (0.5 + 0.5 * Math.sin(t)) +
      0.05 * Math.sin(now * 0.019)
    );
  }, [fireActive, now]);

  useEffect(() => {
    if (!fireAmbienceOn) {
      void stopWavefireAmbience();
      return;
    }
    void startWavefireAmbience();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background") {
        void stopWavefireAmbience();
        return;
      }
      if (s === "active" && fireAmbienceOnRef.current) {
        void startWavefireAmbience();
      }
    });
    return () => {
      sub.remove();
      void stopWavefireAmbience();
    };
  }, [fireAmbienceOn]);

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

  const continentFill = fireVisual
    ? fireVisual.continentFill
    : "rgba(232, 244, 248, 0.93)";
  const continentStroke = fireVisual
    ? fireVisual.continentStroke
    : "rgba(31, 169, 240, 0.15)";

  const centroidDotFill = fireVisual
    ? fireVisual.centroidDotFill
    : "rgba(31, 169, 240, 0.55)";
  const centroidDotOpacity = fireNight ? 0.85 : 0.42;

  const openFireExplore = useCallback(() => {
    if (!fireActive || !fireCluster || !fireVisual) return;
    setFireExploreOpen(true);
  }, [fireActive, fireCluster, fireVisual]);

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
    if (!fireMode) setFireExploreOpen(false);
  }, [fireMode]);

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
          Sign in to filter the map to Ripples and Waves you are part of.
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

              {fireNight && fireVisual && !fireActive ? (
                <G pointerEvents="none">
                  <Circle
                    cx={canvasPixelW / 2}
                    cy={canvasPixelH / 2}
                    r={Math.min(canvasPixelW, canvasPixelH) * 0.165}
                    fill="none"
                    stroke={fireVisual.lineStroke}
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
                    stroke={fireVisual.emberCore}
                    strokeWidth={1.1}
                    strokeOpacity={
                      0.11 +
                      0.09 * (0.5 + 0.5 * Math.sin(now * 0.0018 + 1.1))
                    }
                    strokeDasharray="3 11"
                  />
                </G>
              ) : null}

              {!fireActive
                ? centroidHits.map((h) => (
                    <Circle
                      key={`dot-${h.code}`}
                      cx={h.cx}
                      cy={h.cy}
                      r={fireNight ? 2.5 : 1.6}
                      fill={centroidDotFill}
                      opacity={centroidDotOpacity}
                    />
                  ))
                : null}

              <G>
                {!fireActive
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

              {fireActive && fireVisual && fireRing && fireRing.points.length >= 2 ? (
                <G pointerEvents="none">
                  {(() => {
                    const ringD = atlasWavefireRingPathD(
                      fireRing.points,
                      now * 0.0028,
                    );
                    if (!ringD) return null;
                    return (
                      <>
                        {fireVisual.arcGlowLayers.map((layer, li) => (
                          <Path
                            key={`fire-ring-glow-${li}`}
                            d={ringD}
                            fill="none"
                            stroke={layer.color}
                            strokeWidth={layer.w}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={Math.min(
                              0.95,
                              layer.o * fireArcGlowFlick,
                            )}
                          />
                        ))}
                        <Path
                          d={ringD}
                          fill="none"
                          stroke={fireVisual.lineStroke}
                          strokeWidth={2.15}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={0.9 * fireArcGlowFlick}
                        />
                        <Path
                          d={ringD}
                          fill="none"
                          stroke={fireVisual.campSpark}
                          strokeWidth={0.9}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={0.48 * fireArcGlowFlick}
                        />
                      </>
                    );
                  })()}
                </G>
              ) : null}

              {fireActive && fireVisual
                ? centroidHits.map((h) => {
                    const flick =
                      0.84 +
                      0.16 *
                        (0.5 +
                          0.5 *
                            Math.sin(
                              now * 0.011 +
                                h.code.charCodeAt(0) * 0.07,
                            ));
                    return (
                      <G key={`fire-camp-${h.code}`} pointerEvents="none">
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
                {!fireActive
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
            {fireActive && fireVisual && fireCluster ? (
              <FireClusterExploreBar
                visual={fireVisual}
                cluster={fireCluster}
                clusterIndex={fireClusterIndex}
                clusterCount={fireClusters.length}
                foreground={colors.foreground}
                muted={colors.mutedForeground}
                onExplore={openFireExplore}
                onPrev={() => stepFireCluster(-1)}
                onNext={() => stepFireCluster(1)}
              />
            ) : null}
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
            value={fireClusters.length}
            fg={colors.foreground}
            icon={fireVisual.filterIcon}
            iconColor={fireVisual.lineStroke}
            onPress={fireActive ? openFireExplore : undefined}
          />
        ) : null}
      </View>

      {fireNight && fireVisual && !fireCluster ? (
        <Text style={[styles.wfHint, { color: colors.mutedForeground }]}>
          {fireVisual.emptyHint}
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

      {fireActive && fireCluster && fireVisual ? (
        <AtlasFireExploreModal
          visible={fireExploreOpen}
          onClose={() => setFireExploreOpen(false)}
          fireMode={fireMode}
          visual={fireVisual}
          cluster={fireCluster}
          localRippleMatches={localRippleMatches}
          localWaveEchoes={localWaveEchoes}
          viewerCountryCode={viewerCountryCode}
          viewerMyPhotos={viewerMyPhotos}
        />
      ) : null}
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
    <View style={styles.fireExploreRow} pointerEvents="box-none">
      {multi ? (
        <PressableScale
          onPress={onPrev}
          haptic="light"
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
        style={[
          styles.fireExploreCta,
          {
            backgroundColor: visual.chipActiveBg,
            borderColor: visual.lineStroke,
            shadowColor: visual.chipShadowColor,
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
            <Text style={[styles.fireExploreCounterText, { color: visual.lineStroke }]}>
              {counter}
            </Text>
          </View>
        ) : null}
      </PressableScale>

      {multi ? (
        <PressableScale
          onPress={onNext}
          haptic="light"
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
      filterA11y: ATLAS_FILTER_A11Y.ripples,
    },
    {
      id: "waves",
      label: "",
      filterIcon: "wave-glyph",
      filterIconColor: "#FFD166",
      filterA11y: ATLAS_FILTER_A11Y.waves,
    },
    {
      id: "mine",
      label: "Mine only",
      filterA11y:
        "Mine only — Ripples and Waves you are part of, not everyone else's",
    },
  ];
  const fireModes = [RIPPLEFIRE_VISUAL, WAVEFIRE_VISUAL] as const;
  const standardChip = (active: boolean) => ({
    backgroundColor: active
      ? "rgba(56,189,248,0.35)"
      : "rgba(0,16,24,0.45)",
    borderColor: active ? props.colors.primary : "rgba(255,255,255,0.12)",
    borderWidth: 1,
  });
  const fireChipStyle = (visual: AtlasFireVisual, active: boolean) => ({
    ...standardChip(active),
    borderColor: active ? visual.lineStroke : visual.chipIdleBorder,
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
      <View style={styles.fireChipsColumn}>
        {fireModes.map((visual) => {
          const active = props.filter === visual.mode;
          return (
            <View
              key={visual.mode}
              style={[
                styles.fireEmberGlowWrap,
                {
                  backgroundColor: active
                    ? visual.chipActiveBg
                    : visual.chipIdleBg,
                  borderColor: active
                    ? visual.chipActiveBorder
                    : visual.chipIdleBorder,
                },
                Platform.OS === "ios"
                  ? fireChipShadowIos(visual, active)
                  : null,
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={visual.label}
                onPress={() => props.onChange(visual.mode)}
                style={[
                  styles.filterFireChip,
                  fireChipStyle(visual, active),
                ]}
              >
                <Icon
                  name={visual.filterIcon}
                  size={16}
                  color={active ? "#fff" : visual.lineStroke}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    styles.filterFireChipText,
                    {
                      color: active ? "#fff" : props.colors.foreground,
                    },
                  ]}
                >
                  {visual.label}
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
  fireChipsColumn: {
    flexShrink: 0,
    gap: 6,
    alignItems: "stretch",
  },
  fireEmberGlowWrap: {
    borderRadius: 14,
    padding: 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterFireChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexShrink: 0,
  },
  filterChipText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  filterFireChipText: {
    fontSize: 12,
    lineHeight: 16,
  },
  mapClip: {
    alignSelf: "center",
    position: "relative",
    borderRadius: 18,
    overflow: "hidden",
  },
  fireExploreRow: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 4,
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
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.28,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  fireExploreCta: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
      default: {},
    }),
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
});
