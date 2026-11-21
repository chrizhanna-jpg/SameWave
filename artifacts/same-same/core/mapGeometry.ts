/**
 * Shapes for the Waves map. One line per Wave.
 *
 * Two distinct pins: a calm arc (or short straight) between them. Never a
 * self-loop. Near-zero pairs keep pins only. Several Waves that share an
 * endpoint fan their pins so each stays tappable; lines always run pin-to-pin.
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
   * Legacy size hint (used as a fallback fan when viewScale is unset).
   * Loops are gone — kept so callers that already pass `loopSize` keep compiling.
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
   * Current map view scale (screen px per map unit). When set with
   * `fanScreenPx`, overlapping pins fan so their on-screen centres stay
   * at least that many pixels apart — and ease back toward truth as you zoom.
   */
  viewScale?: number;
  /** Minimum on-screen separation between pin centres (px). Default 16. */
  fanScreenPx?: number;
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
    });
    rawMarkers.push({
      waveId: wave.id,
      side: "theirs",
      photoId: wave.id,
      point: theirs.point,
    });
    placedByWave.set(wave.id, { mine, theirs });
  }

  // Fan overlapping pins in screen space so none hides another. Map-unit
  // separation shrinks as you zoom in (pins ease back toward true spots).
  const viewScale = Math.max(0.05, options.viewScale ?? 1);
  const fanScreen = options.fanScreenPx ?? 16;
  const minSepMap =
    options.viewScale != null
      ? fanScreen / viewScale
      : Math.max(8, Math.min(12, options.loopSize * 0.18));
  const clusterMap =
    options.viewScale != null ? Math.max(minSepMap * 0.9, 2 / viewScale) : Math.min(8, minSepMap);
  const markers = spreadCoincidentMarkers(rawMarkers, minSepMap, clusterMap);

  const arcCounts = new Map<string, number>();
  const lines: MapLine[] = [];

  for (const wave of waves) {
    const mineMark = markers.find((m) => m.waveId === wave.id && m.side === "mine");
    const theirsMark = markers.find((m) => m.waveId === wave.id && m.side === "theirs");
    if (!mineMark || !theirsMark) continue;

    const placed = placedByWave.get(wave.id);
    // Decide from geography *before* pin fan — fanning coincident ends apart
    // must not create short stub lines that look like UK/France curls.
    const geoA = placed?.mine.point ?? mineMark.point;
    const geoB = placed?.theirs.point ?? theirsMark.point;
    const geoChord = Math.hypot(geoA.x - geoB.x, geoA.y - geoB.y);
    if (geoChord < minLine) continue; // pins only — never a loop or stub

    // Strokes always end on the (possibly fanned) visible pins.
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
    // Prefer geodesic when both lon/lats are known; otherwise bow in screen space
    // between the (already fanned) pin positions so the stroke ends on the pins.
    let shape: Shape | null = null;
    const mineLon = placed?.mine.lonLat ?? null;
    const theirsLon = placed?.theirs.lonLat ?? null;
    if (mineLon && theirsLon && projectLonLat && index === 0) {
      // First of a pair: geographic arc, then nudge ends onto the fanned pins.
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

/**
 * Nudge markers that sit on the same (or nearly the same) map point onto a
 * ring so centres stay at least `minSeparation` map units apart. Groups by
 * proximity across both sides — a London mine and London theirs fan together.
 * `clusterWithin` merges points closer than that many map units into one ring.
 */
export function spreadCoincidentMarkers(
  markers: readonly MapMarker[],
  minSeparation: number,
  clusterWithin = 0,
): MapMarker[] {
  const anchors: Point[] = [];
  const groupIds: number[] = [];
  for (const marker of markers) {
    let gid = -1;
    if (clusterWithin <= 0) {
      const exact = `${marker.point.x.toFixed(1)},${marker.point.y.toFixed(1)}`;
      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i]!;
        if (`${a.x.toFixed(1)},${a.y.toFixed(1)}` === exact) {
          gid = i;
          break;
        }
      }
    } else {
      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i]!;
        if (Math.hypot(a.x - marker.point.x, a.y - marker.point.y) <= clusterWithin) {
          gid = i;
          break;
        }
      }
    }
    if (gid < 0) {
      gid = anchors.length;
      anchors.push({ ...marker.point });
    }
    groupIds.push(gid);
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < markers.length; i++) {
    const gid = groupIds[i]!;
    const list = groups.get(gid) ?? [];
    list.push(i);
    groups.set(gid, list);
  }

  const out = markers.map((m) => ({ ...m, point: { ...m.point } }));
  for (const indices of groups.values()) {
    const n = indices.length;
    if (n <= 1) continue;
    // Ring radius so adjacent centres are ≥ minSeparation apart.
    const ring = minSeparation / (2 * Math.sin(Math.PI / n));
    // Anchor at the cluster centroid (stable as membership grows).
    let cx = 0;
    let cy = 0;
    for (const i of indices) {
      cx += markers[i]!.point.x;
      cy += markers[i]!.point.y;
    }
    cx /= n;
    cy /= n;
    for (let k = 0; k < n; k++) {
      const i = indices[k]!;
      const angle = -Math.PI / 2 + (k * 2 * Math.PI) / n;
      out[i] = {
        ...out[i]!,
        point: {
          x: cx + ring * Math.cos(angle),
          y: cy + ring * Math.sin(angle),
        },
      };
    }
  }
  return out;
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
