/**
 * Shapes for the Waves map. One line per Wave.
 *
 * Two distinct pins: a calm arc (or short straight) between them. Never a
 * self-loop. Near-zero pairs keep pins only. Pins sit at true geographic
 * positions — never spiderfied or fanned. Nearby pins (city-level, ~25 km)
 * stay as one counted stack at every zoom; farther pins only merge when they
 * overlap on screen and split again as you zoom in. Lines attach to the
 * visible cluster pin.
 */
import { normalizeCountryCode } from "../data/countries";
import { centroidLonLatForCountry } from "../data/countryCentroids";

export interface Point {
  x: number;
  y: number;
}

export interface MapWaveInput {
  id: string;
  /** Country of the user's photo. */
  mine: string | null;
  /** Country of the other photo. */
  theirs: string | null;
  /** Precise capture position [lng, lat] when known (overrides country centroid). */
  mineLonLat?: [number, number] | null;
  /** Precise capture position [lng, lat] when known (overrides country centroid). */
  theirsLonLat?: [number, number] | null;
}

/** Endpoint marker for a Wave photo on the map. */
export interface MapMarker {
  waveId: string;
  side: "mine" | "theirs";
  photoId: string;
  point: Point;
  /** Capture / centroid [lng, lat] when known — used for city-level stacking. */
  lonLat?: [number, number];
}

export interface MapLine {
  waveId: string;
  kind: "arc" | "straight";
  /** SVG path data. */
  d: string;
  /** Furthest point from the ends: the top of an arc, or the midpoint of a short. */
  tip: Point;
  /** Points along the line, in order, for working out which line was touched. */
  points: Point[];
}

export interface MapGeometryOptions {
  /**
   * Legacy size hint. Loops/fan are gone — kept so callers that already pass
   * `loopSize` keep compiling.
   */
  loopSize: number;
  /** Used when neither photo has a country. Usually the user's home country. */
  fallbackCountry?: string | null;
  /**
   * Below this chord (map units): pins only, no stroke.
   * Defaults to a few pixels so identical centroids don't scribble.
   */
  minLineLength?: number;
  /** @deprecated Alias for minLineLength. */
  minArcLength?: number;
  /**
   * Below this chord (map units): draw a straight short instead of an arc.
   */
  straightBelow?: number;
  /**
   * Current map view scale (screen px per map unit). Used with
   * `clusterScreenPx` to merge overlapping pins into count badges.
   */
  viewScale?: number;
  /**
   * Pins closer than this many screen pixels merge into one cluster.
   * Default 44 (matches the minimum hit target). Always screen pixels —
   * converted to map units as `clusterScreenPx / viewScale`.
   */
  clusterScreenPx?: number;
  /** @deprecated Use clusterScreenPx. */
  fanScreenPx?: number;
  /**
   * Projected world width in map units. Lines whose X-span exceeds
   * `maxLineWidthFraction` of this are dropped (antimeridian / ocean-spanning).
   */
  mapWidth?: number;
  /** Drop lines wider than this fraction of mapWidth. Default 0.5. */
  maxLineWidthFraction?: number;
  /**
   * @deprecated Ring expand removed — sticky city stacks stay as one badge.
   * Kept so older callers still typecheck.
   */
  expandAboveScale?: number;
  /** @deprecated Ring expand removed. */
  expandScreenPx?: number;
  /**
   * Pins within this many kilometres stay stacked at every zoom (city-level).
   * Default 25. Set 0 to disable sticky geo merge (screen clustering only).
   */
  cityMergeKm?: number;
}

/** A displayed pin: one photo, or several merged at the current zoom. */
export interface MapCluster {
  id: string;
  /** True geographic position (centroid of members — no spiderfy offset). */
  point: Point;
  count: number;
  members: readonly MapMarker[];
}

/** Where a Wave is drawn when no country is known: open water in the Atlantic. */
export const SOMEWHERE = "ZZ";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const SAMPLES = 16;
/** Default: drop hairlines shorter than this. */
export const MIN_LINE_LENGTH = 3;
/** Default: straight stroke when the chord is shorter than this. */
export const STRAIGHT_BELOW = 28;
/** Soft cap on arc bow as a fraction of chord length. */
export const MAX_BOW = 0.14;
/** Samples along a geodesic before projecting. */
const GEODESIC_SAMPLES = 24;

/** @deprecated Use MIN_LINE_LENGTH — kept for older tests/imports. */
export const MIN_ARC_LENGTH = MIN_LINE_LENGTH;

function minLineFor(options: MapGeometryOptions): number {
  return options.minLineLength ?? options.minArcLength ?? MIN_LINE_LENGTH;
}

function straightBelowFor(options: MapGeometryOptions): number {
  return options.straightBelow ?? STRAIGHT_BELOW;
}

function round(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

/** Points along a Bezier curve with the given control points. */
function sample(controls: readonly Point[]): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    let level = [...controls];
    while (level.length > 1) {
      const next: Point[] = [];
      for (let k = 0; k < level.length - 1; k++) {
        const from = level[k] as Point;
        const to = level[k + 1] as Point;
        next.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      }
      level = next;
    }
    points.push(level[0] as Point);
  }
  return points;
}

type Shape = Pick<MapLine, "d" | "tip" | "points">;

/**
 * How far the nth line between the same two pins bows, as a share of chord.
 * Magnitude is capped and scaled down for short chords so Europe never curls.
 */
export function arcBow(index: number, chord = 100): number {
  const step = Math.floor(index / 2);
  const base = Math.min(MAX_BOW, 0.06 + 0.04 * step);
  const scale = Math.min(1, Math.max(0, chord / 90));
  const magnitude = base * scale;
  return index % 2 === 0 ? magnitude : -magnitude;
}

/** SVG path + tip from a polyline of projected points, with optional screen-space bow. */
export function pathFromPoints(
  raw: readonly Point[],
  bow = 0,
  minLength = MIN_LINE_LENGTH,
): Shape | null {
  if (raw.length < 2) return null;
  const a = raw[0]!;
  const b = raw[raw.length - 1]!;
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  if (chord < minLength) return null;

  let points = [...raw];
  if (bow !== 0 && chord > 0) {
    let nx = -(b.y - a.y) / chord;
    let ny = (b.x - a.x) / chord;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    points = raw.map((p, i) => {
      const t = i / (raw.length - 1);
      const arch = Math.sin(Math.PI * t) * bow * chord;
      return { x: p.x + nx * arch, y: p.y + ny * arch };
    });
  }

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${round(p.x)} ${round(p.y)}`)
    .join(" ");
  const mid = points[Math.floor(points.length / 2)] ?? a;
  return { d, tip: mid, points };
}

/** Straight segment between two pins (for short pairs). */
export function straightPath(a: Point, b: Point, minLength = MIN_LINE_LENGTH): Shape | null {
  return pathFromPoints([a, b], 0, minLength);
}

/** Spherical linear interpolation between two lon/lat degrees. */
export function geodesicLonLat(
  a: readonly [number, number],
  b: readonly [number, number],
  t: number,
): [number, number] {
  const toRad = Math.PI / 180;
  const lat1 = a[1] * toRad;
  const lon1 = a[0] * toRad;
  const lat2 = b[1] * toRad;
  const lon2 = b[0] * toRad;
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    );
  if (d < 1e-9) return [a[0], a[1]];
  const A = Math.sin((1 - t) * d) / Math.sin(d);
  const B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
  const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);
  return [(Math.atan2(y, x) * 180) / Math.PI, (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI];
}

/**
 * Project a great-circle between two lon/lat points, then optionally bow in
 * screen space so same-pair Waves stay separable.
 */
export function geodesicArcPath(
  aLonLat: readonly [number, number],
  bLonLat: readonly [number, number],
  projectLonLat: ProjectLonLat,
  bow: number,
  minLength = MIN_LINE_LENGTH,
): Shape | null {
  const projected: Point[] = [];
  for (let i = 0; i <= GEODESIC_SAMPLES; i++) {
    const lonLat = geodesicLonLat(aLonLat, bLonLat, i / GEODESIC_SAMPLES);
    const point = projectLonLat([lonLat[0], lonLat[1]]);
    if (!point) return null;
    projected.push(point);
  }
  return pathFromPoints(projected, bow, minLength);
}

/** A curved line from `a` to `b`. A positive bow curves towards the top of the map. */
export function arcPath(a: Point, b: Point, bow: number, minLength = MIN_LINE_LENGTH): Shape | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  if (length < minLength) return null;
  if (Math.abs(bow) < 1e-6) return straightPath(a, b, minLength);
  let nx = -dy / length;
  let ny = dx / length;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const control = {
    x: (a.x + b.x) / 2 + nx * length * bow,
    y: (a.y + b.y) / 2 + ny * length * bow,
  };
  return pathFromPoints(sample([a, control, b]), 0, minLength);
}

export type ProjectCountry = (countryCode: string) => Point | null;
export type ProjectLonLat = (lonLat: [number, number]) => Point | null;

type Placed = { code: string; point: Point; lonLat: [number, number] | null };

/**
 * Lines + endpoint markers for Waves.
 * Prefer precise lon/lat when present; otherwise country centroids.
 * Never draws self-loops — coincident ends keep pins only.
 */
export function buildMapLines(
  waves: readonly MapWaveInput[],
  project: ProjectCountry,
  options: MapGeometryOptions,
  projectLonLat?: ProjectLonLat,
): MapLine[] {
  return buildMapGeometry(waves, project, options, projectLonLat).lines;
}

export function buildMapGeometry(
  waves: readonly MapWaveInput[],
  project: ProjectCountry,
  options: MapGeometryOptions,
  projectLonLat?: ProjectLonLat,
): { lines: MapLine[]; markers: MapMarker[] } {
  const placeCountry = (code: string | null): Placed | null => {
    const normalized = normalizeCountryCode(code);
    if (!normalized) return null;
    const point = project(normalized);
    if (!point) return null;
    const lonLat = centroidLonLatForCountry(normalized) as [number, number] | null;
    return { code: normalized, point, lonLat };
  };
  const placeLonLat = (
    lonLat: [number, number] | null | undefined,
    code: string | null,
  ): Placed | null => {
    if (lonLat && projectLonLat) {
      const point = projectLonLat(lonLat);
      if (point) {
        return {
          code: normalizeCountryCode(code) ?? "XX",
          point,
          lonLat: [lonLat[0], lonLat[1]],
        };
      }
    }
    return placeCountry(code);
  };
  const fallback = placeCountry(options.fallbackCountry ?? null) ?? placeCountry(SOMEWHERE);
  const minLine = minLineFor(options);
  const straightBelow = straightBelowFor(options);

  const rawMarkers: MapMarker[] = [];
  const placedByWave = new Map<string, { mine: Placed; theirs: Placed }>();

  for (const wave of waves) {
    const mine =
      placeLonLat(wave.mineLonLat ?? null, wave.mine) ??
      placeLonLat(wave.theirsLonLat ?? null, wave.theirs) ??
      fallback;
    const theirs =
      placeLonLat(wave.theirsLonLat ?? null, wave.theirs) ??
      placeLonLat(wave.mineLonLat ?? null, wave.mine) ??
      fallback;
    if (!mine || !theirs) continue;

    rawMarkers.push({
      waveId: wave.id,
      side: "mine",
      photoId: wave.id,
      point: mine.point,
      ...(mine.lonLat ? { lonLat: mine.lonLat } : {}),
    });
    rawMarkers.push({
      waveId: wave.id,
      side: "theirs",
      photoId: wave.id,
      point: theirs.point,
      ...(theirs.lonLat ? { lonLat: theirs.lonLat } : {}),
    });
    placedByWave.set(wave.id, { mine, theirs });
  }

  // Pins stay at true geographic positions — clustering is a separate pass.
  const markers = rawMarkers;

  const arcCounts = new Map<string, number>();
  const lines: MapLine[] = [];

  for (const wave of waves) {
    const mineMark = markers.find((m) => m.waveId === wave.id && m.side === "mine");
    const theirsMark = markers.find((m) => m.waveId === wave.id && m.side === "theirs");
    if (!mineMark || !theirsMark) continue;

    const placed = placedByWave.get(wave.id);
    const geoA = placed?.mine.point ?? mineMark.point;
    const geoB = placed?.theirs.point ?? theirsMark.point;
    const geoChord = Math.hypot(geoA.x - geoB.x, geoA.y - geoB.y);
    if (geoChord < minLine) continue; // pins only — never a loop or stub

    const a = mineMark.point;
    const b = theirsMark.point;
    const chord = Math.hypot(a.x - b.x, a.y - b.y);
    if (chord < minLine) continue;

    const key =
      placed && placed.mine.code === placed.theirs.code
        ? `${placed.mine.code}|${a.x.toFixed(1)},${a.y.toFixed(1)}|${b.x.toFixed(1)},${b.y.toFixed(1)}`
        : placed
          ? placed.mine.code < placed.theirs.code
            ? `${placed.mine.code}|${placed.theirs.code}`
            : `${placed.theirs.code}|${placed.mine.code}`
          : `${a.x.toFixed(1)},${a.y.toFixed(1)}|${b.x.toFixed(1)},${b.y.toFixed(1)}`;
    const index = arcCounts.get(key) ?? 0;
    arcCounts.set(key, index + 1);

    if (geoChord < straightBelow) {
      const shape = straightPath(a, b, minLine);
      if (shape) lines.push({ waveId: wave.id, kind: "straight", ...shape });
      continue;
    }

    const bow = arcBow(index, chord);
    let shape: Shape | null = null;
    const mineLon = placed?.mine.lonLat ?? null;
    const theirsLon = placed?.theirs.lonLat ?? null;
    if (mineLon && theirsLon && projectLonLat && index === 0) {
      const geo = geodesicArcPath(mineLon, theirsLon, projectLonLat, bow, minLine);
      if (geo && geo.points.length >= 2) {
        const mid = geo.points.slice(1, -1);
        shape = pathFromPoints([a, ...mid, b], 0, minLine);
      }
    }
    if (!shape) {
      shape = arcPath(a, b, bow, minLine);
    }
    if (shape) lines.push({ waveId: wave.id, kind: "arc", ...shape });
  }

  return { lines, markers };
}

/** Markers for Wave endpoints with real photo ids (both sides). */
export function buildMapMarkers(
  waves: readonly {
    id: string;
    mine: { photoId: string; countryCode: string | null; lat?: number | null; lng?: number | null };
    theirs: { photoId: string; countryCode: string | null; lat?: number | null; lng?: number | null };
  }[],
  project: ProjectCountry,
  options: MapGeometryOptions,
  projectLonLat?: ProjectLonLat,
): MapMarker[] {
  const inputs: MapWaveInput[] = waves.map((w) => ({
    id: w.id,
    mine: w.mine.countryCode,
    theirs: w.theirs.countryCode,
    mineLonLat:
      w.mine.lng != null && w.mine.lat != null ? [w.mine.lng, w.mine.lat] : null,
    theirsLonLat:
      w.theirs.lng != null && w.theirs.lat != null ? [w.theirs.lng, w.theirs.lat] : null,
  }));
  const { markers } = buildMapGeometry(inputs, project, options, projectLonLat);
  return markers.map((m) => {
    const wave = waves.find((w) => w.id === m.waveId);
    if (!wave) return m;
    return {
      ...m,
      photoId: m.side === "mine" ? wave.mine.photoId : wave.theirs.photoId,
    };
  });
}

/** Default on-screen merge distance (also the minimum pin hit target). */
export const CLUSTER_SCREEN_PX = 44;
/** Count badge diameter in screen px. */
export const CLUSTER_BADGE_SIZE = 24;
/** Drop lines whose projected width exceeds this share of the world. */
export const MAX_LINE_WIDTH_FRACTION = 0.5;
/**
 * @deprecated Ring expand removed — kept so older imports don't break.
 */
export const EXPAND_SCREEN_PX = 30;
/** City-level sticky stack radius (roughly right is enough). */
export const CITY_MERGE_KM = 25;

/** Great-circle distance in kilometres between [lng, lat] pairs. */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const sin =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(sin)));
}

/**
 * Pinch-zoom about a screen-space focal point for a top-left transform origin
 * (`transformOrigin: "0 0"`, then translate then scale).
 *
 * `newTranslate = focal - (focal - translate) * (newScale / oldScale)`
 */
export function focalZoomTransform(
  oldScale: number,
  newScale: number,
  translateX: number,
  translateY: number,
  focalX: number,
  focalY: number,
): { scale: number; x: number; y: number } {
  const from = Math.max(oldScale, 1e-6);
  const to = Math.max(newScale, 1e-6);
  const ratio = to / from;
  return {
    scale: to,
    x: focalX - (focalX - translateX) * ratio,
    y: focalY - (focalY - translateY) * ratio,
  };
}

function markerKey(m: MapMarker): string {
  return `${m.waveId}:${m.side}`;
}

/** Largest pairwise distance among marker true positions. */
export function membersTrueSpan(members: readonly MapMarker[]): number {
  let max = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const d = Math.hypot(
        members[i]!.point.x - members[j]!.point.x,
        members[i]!.point.y - members[j]!.point.y,
      );
      if (d > max) max = d;
    }
  }
  return max;
}

/**
 * Horizontal span of a polyline in map units. Used to catch ocean-spanning /
 * antimeridian strokes that slash across the whole keep-sake map.
 */
export function lineWidthSpan(line: Pick<MapLine, "points">): number {
  if (line.points.length === 0) return 0;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of line.points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }
  return maxX - minX;
}

/** True when a line's X-span covers too much of the projected world. */
export function isOverwideLine(
  line: Pick<MapLine, "points">,
  mapWidth: number,
  maxFraction = MAX_LINE_WIDTH_FRACTION,
): boolean {
  if (mapWidth <= 0) return false;
  return lineWidthSpan(line) > mapWidth * maxFraction;
}

function groupLonLat(members: readonly MapMarker[]): [number, number] | null {
  let lng = 0;
  let lat = 0;
  let n = 0;
  for (const m of members) {
    if (!m.lonLat) continue;
    lng += m.lonLat[0];
    lat += m.lonLat[1];
    n += 1;
  }
  return n > 0 ? [lng / n, lat / n] : null;
}

/**
 * True when every member with coordinates sits inside the city-level stack
 * radius — a sticky badge that must not ring-expand or split on zoom.
 */
export function isStickyStack(
  cluster: Pick<MapCluster, "members">,
  cityMergeKm = CITY_MERGE_KM,
): boolean {
  if (cluster.members.length <= 1) return false;
  if (cityMergeKm <= 0) {
    return membersTrueSpan(cluster.members) < 1e-6;
  }
  const withLl = cluster.members.filter((m) => m.lonLat);
  if (withLl.length >= 2) {
    for (let i = 0; i < withLl.length; i++) {
      for (let j = i + 1; j < withLl.length; j++) {
        if (haversineKm(withLl[i]!.lonLat!, withLl[j]!.lonLat!) > cityMergeKm) {
          return false;
        }
      }
    }
    return true;
  }
  // No lon/lat: treat near-identical map points as sticky.
  return membersTrueSpan(cluster.members) < 1e-3;
}

/**
 * Merge markers that either share a city (~`cityMergeKm`) or fall within
 * `clusterScreenPx` on screen. Radius for the latter is always
 * `clusterScreenPx / viewScale`. Cluster pin sits at the true centroid —
 * never offset into a ring or fan.
 */
export function clusterMarkers(
  markers: readonly MapMarker[],
  viewScale: number,
  clusterScreenPx = CLUSTER_SCREEN_PX,
  cityMergeKm = CITY_MERGE_KM,
): MapCluster[] {
  const scale = Math.max(0.05, viewScale);
  // Screen pixels → map units (never treat clusterScreenPx as map units).
  const radiusMap = clusterScreenPx / scale;
  type Acc = { members: MapMarker[]; sx: number; sy: number };
  const groups: Acc[] = [];

  for (const marker of markers) {
    let joined = -1;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]!;
      const n = g.members.length;
      const cx = g.sx / n;
      const cy = g.sy / n;
      const screenClose =
        Math.hypot(marker.point.x - cx, marker.point.y - cy) <= radiusMap;
      let cityClose = false;
      if (cityMergeKm > 0 && marker.lonLat) {
        const centre = groupLonLat(g.members);
        if (centre) {
          cityClose = haversineKm(marker.lonLat, centre) <= cityMergeKm;
        }
      }
      if (screenClose || cityClose) {
        joined = i;
        break;
      }
    }
    if (joined < 0) {
      groups.push({ members: [marker], sx: marker.point.x, sy: marker.point.y });
    } else {
      const g = groups[joined]!;
      g.members.push(marker);
      g.sx += marker.point.x;
      g.sy += marker.point.y;
    }
  }

  return groups.map((g, i) => {
    const n = g.members.length;
    const point = { x: g.sx / n, y: g.sy / n };
    const id =
      n === 1
        ? markerKey(g.members[0]!)
        : `cluster:${i}:${g.members
            .map(markerKey)
            .sort()
            .join("|")}`;
    return { id, point, count: n, members: g.members };
  });
}

/**
 * @deprecated Artificial ring expand removed. Sticky city stacks stay as one
 * counted pin; tap the badge for the list. Returns clusters unchanged.
 */
export function expandUnresolvedClusters(
  clusters: readonly MapCluster[],
  _viewScale?: number,
  _options?: {
    expandAboveScale?: number;
    expandScreenPx?: number;
    clusterScreenPx?: number;
  },
): MapCluster[] {
  return clusters.map((c) => ({
    ...c,
    members: c.members.map((m) => ({ ...m, point: { ...m.point } })),
  }));
}

/**
 * Redraw lines so each end sits on the visible cluster pin for that endpoint.
 * Drops a line when both ends collapse into the same cluster, or when the
 * stroke would slash across most of the world map.
 */
export function attachLinesToClusters(
  lines: readonly MapLine[],
  markers: readonly MapMarker[],
  clusters: readonly MapCluster[],
  options: Pick<
    MapGeometryOptions,
    | "minLineLength"
    | "minArcLength"
    | "straightBelow"
    | "mapWidth"
    | "maxLineWidthFraction"
  > = {},
): MapLine[] {
  const minLine = minLineFor(options as MapGeometryOptions);
  const straightBelow = straightBelowFor(options as MapGeometryOptions);
  const mapWidth = options.mapWidth ?? 0;
  const maxFrac = options.maxLineWidthFraction ?? MAX_LINE_WIDTH_FRACTION;
  const byKey = new Map<string, MapCluster>();
  for (const cluster of clusters) {
    for (const m of cluster.members) {
      // Prefer the expanded display member when present.
      byKey.set(markerKey(m), cluster);
      byKey.set(`${m.waveId}:${m.side}`, cluster);
    }
  }
  const findCluster = (waveId: string, side: "mine" | "theirs") => {
    const direct = byKey.get(`${waveId}:${side}`);
    if (direct) return direct;
    const marker = markers.find((m) => m.waveId === waveId && m.side === side);
    if (!marker) return null;
    return byKey.get(markerKey(marker)) ?? null;
  };

  const out: MapLine[] = [];
  const pairCounts = new Map<string, number>();
  for (const line of lines) {
    const mine = findCluster(line.waveId, "mine");
    const theirs = findCluster(line.waveId, "theirs");
    if (!mine || !theirs) continue;
    if (mine.id === theirs.id) continue; // both ends in one pin — no stroke
    const a = mine.point;
    const b = theirs.point;
    const chord = Math.hypot(a.x - b.x, a.y - b.y);
    if (chord < minLine) continue;
    // Skip ocean-spanning chords (e.g. US→JP across the whole Equal Earth canvas).
    if (mapWidth > 0 && Math.abs(a.x - b.x) > mapWidth * maxFrac) continue;
    const pairKey = mine.id < theirs.id ? `${mine.id}|${theirs.id}` : `${theirs.id}|${mine.id}`;
    const index = pairCounts.get(pairKey) ?? 0;
    pairCounts.set(pairKey, index + 1);
    const shape =
      chord < straightBelow
        ? straightPath(a, b, minLine)
        : arcPath(a, b, arcBow(index, chord), minLine);
    if (!shape) continue;
    const next: MapLine = {
      waveId: line.waveId,
      kind: chord < straightBelow ? "straight" : "arc",
      ...shape,
    };
    if (mapWidth > 0 && isOverwideLine(next, mapWidth, maxFrac)) continue;
    out.push(next);
  }
  return out;
}

/**
 * Full clustered view for the current zoom: true-position markers, city-level
 * sticky stacks + screen-pixel clusters, and lines attached to those pins —
 * never ocean-spanning strokes, never artificial ring offsets.
 */
export function buildClusteredView(
  waves: readonly MapWaveInput[],
  project: ProjectCountry,
  options: MapGeometryOptions,
  projectLonLat?: ProjectLonLat,
): { markers: MapMarker[]; clusters: MapCluster[]; lines: MapLine[] } {
  const { markers, lines: rawLines } = buildMapGeometry(waves, project, options, projectLonLat);
  const viewScale = Math.max(0.05, options.viewScale ?? 1);
  const clusterPx = options.clusterScreenPx ?? options.fanScreenPx ?? CLUSTER_SCREEN_PX;
  const cityKm = options.cityMergeKm ?? CITY_MERGE_KM;
  const clusters = clusterMarkers(markers, viewScale, clusterPx, cityKm);
  const mapWidth = options.mapWidth ?? 0;
  const maxFrac = options.maxLineWidthFraction ?? MAX_LINE_WIDTH_FRACTION;
  const filteredRaw =
    mapWidth > 0 ? rawLines.filter((l) => !isOverwideLine(l, mapWidth, maxFrac)) : rawLines;
  const lines = attachLinesToClusters(filteredRaw, markers, clusters, options);
  return { markers, clusters, lines };
}

/**
 * @deprecated Spiderfy removed — returns markers unchanged (true positions).
 * Prefer `clusterMarkers`.
 */
export function spreadCoincidentMarkers(
  markers: readonly MapMarker[],
  _minSeparation?: number,
  _clusterWithin?: number,
): MapMarker[] {
  return markers.map((m) => ({ ...m, point: { ...m.point } }));
}

/** Axis-aligned bounds of points, or null when empty. */
export function boundsOf(points: readonly Point[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export type MapBounds = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Prefer the densest local cluster (seeded by home when known) so a lone
 * overseas Wave does not yank the first view away from Europe.
 */
export function focusBounds(
  points: readonly Point[],
  seed: Point | null = null,
  keepRatio = 0.65,
): MapBounds | null {
  if (points.length === 0) return null;
  if (points.length <= 3) return boundsOf(points);
  const origin =
    seed ??
    ({
      x: points.reduce((s, p) => s + p.x, 0) / points.length,
      y: points.reduce((s, p) => s + p.y, 0) / points.length,
    } satisfies Point);
  const ranked = [...points].sort(
    (a, b) =>
      Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y),
  );
  const keep = Math.max(3, Math.ceil(ranked.length * keepRatio));
  const core = ranked.slice(0, keep);
  const radius = Math.hypot(
    core[core.length - 1]!.x - origin.x,
    core[core.length - 1]!.y - origin.y,
  );
  // Pull in neighbours that sit just outside the core so a tight Europe
  // cluster is not clipped mid-country.
  const padded = ranked.filter(
    (p) => Math.hypot(p.x - origin.x, p.y - origin.y) <= radius * 1.35 + 24,
  );
  return boundsOf(padded.length >= 3 ? padded : core);
}

/**
 * Scale + translate so `bounds` fills `box` with padding.
 * Assumes transform-origin top-left (WorldMap sets `transformOrigin: "0 0"`).
 */
export function frameTransform(
  bounds: MapBounds,
  box: { width: number; height: number },
  options: { padding?: number; minScale?: number; maxScale?: number } = {},
): { scale: number; x: number; y: number } {
  const padding = options.padding ?? 36;
  const minScale = options.minScale ?? 1;
  const maxScale = options.maxScale ?? 4;
  const bw = Math.max(bounds.maxX - bounds.minX, 48);
  const bh = Math.max(bounds.maxY - bounds.minY, 48);
  const usableW = Math.max(1, box.width - padding * 2);
  const usableH = Math.max(1, box.height - padding * 2);
  const scale = Math.min(maxScale, Math.max(minScale, Math.min(usableW / bw, usableH / bh)));
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    x: box.width / 2 - cx * scale,
    y: box.height / 2 - cy * scale,
  };
}

/** Nearest marker within `reach`, or null. */
export function markerAt(
  markers: readonly MapMarker[],
  point: Point,
  reach: number,
): MapMarker | null {
  let best: MapMarker | null = null;
  let bestDist = Infinity;
  for (const marker of markers) {
    const d = Math.hypot(point.x - marker.point.x, point.y - marker.point.y);
    if (d > reach) continue;
    if (
      !best ||
      d < bestDist ||
      (d === bestDist && marker.waveId < best.waveId)
    ) {
      best = marker;
      bestDist = d;
    }
  }
  return best;
}

/** Nearest cluster within `reach` (map units), or null. */
export function clusterAt(
  clusters: readonly MapCluster[],
  point: Point,
  reach: number,
): MapCluster | null {
  let best: MapCluster | null = null;
  let bestDist = Infinity;
  for (const cluster of clusters) {
    const d = Math.hypot(point.x - cluster.point.x, point.y - cluster.point.y);
    if (d > reach) continue;
    if (!best || d < bestDist || (d === bestDist && cluster.id < best.id)) {
      best = cluster;
      bestDist = d;
    }
  }
  return best;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** How far a point is from a line, in map units. */
export function distanceToLine(line: MapLine, point: Point): number {
  let best = Infinity;
  for (let i = 0; i < line.points.length - 1; i++) {
    best = Math.min(
      best,
      distanceToSegment(point, line.points[i] as Point, line.points[i + 1] as Point),
    );
  }
  return best;
}

/**
 * The line a touch at `point` means.
 *
 * Only lines passing within `reach` of the touch are considered. Among those
 * the one whose tip is nearest the touch wins.
 */
export function lineAt(lines: readonly MapLine[], point: Point, reach: number): MapLine | null {
  let best: MapLine | null = null;
  let bestTipDistance = Infinity;
  for (const line of lines) {
    if (distanceToLine(line, point) > reach) continue;
    const tipDistance = Math.hypot(point.x - line.tip.x, point.y - line.tip.y);
    if (tipDistance < bestTipDistance) {
      best = line;
      bestTipDistance = tipDistance;
    }
  }
  return best;
}

/** @deprecated Loops removed — kept as a no-op stub for any stray imports. */
export function loopPath(at: Point, _angle: number, _size: number): Shape {
  return { d: `M${round(at.x)} ${round(at.y)}`, tip: at, points: [at] };
}

/** @deprecated Loops removed. */
export function loopPlacement(index: number, baseSize: number): { angle: number; size: number } {
  return { angle: -Math.PI / 2 + index * GOLDEN_ANGLE, size: baseSize };
}
