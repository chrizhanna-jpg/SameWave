/**
 * Shapes for the Waves map. One line per Wave.
 *
 * Two places: a geographic great-circle–style arc between them. Several Waves
 * between the same pair fan out so each can be tapped.
 * One country: a soft loop that leaves the country and returns. Loops in the
 * same country spread in angle and size so each can be tapped.
 * Near-zero-length pairs drop their line (markers stay) so Europe doesn't
 * fill with hairlines.
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
  kind: "arc" | "loop";
  /** SVG path data. */
  d: string;
  /** Furthest point from the ends: the top of an arc, the tip of a loop. */
  tip: Point;
  /** Points along the line, in order, for working out which line was touched. */
  points: Point[];
}

export interface MapGeometryOptions {
  /** Length of the smallest loop, in map units. */
  loopSize: number;
  /** Used when neither photo has a country. Usually the user's home country. */
  fallbackCountry?: string | null;
  /**
   * Drop arc strokes shorter than this (map units). Defaults to ~half a loop
   * so phone-scale maps lose hairlines without killing real city-to-city arcs.
   */
  minArcLength?: number;
}

/** Where a Wave is drawn when no country is known: open water in the Atlantic. */
export const SOMEWHERE = "ZZ";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const LOOP_SPREAD = 0.6;
const LOOP_REACH = 1.35;
const LOOP_GROWTH = 0.12;
const LOOP_MAX_SCALE = 2.2;

const SAMPLES = 16;
/** Fallback when options omit minArcLength (phone Equal Earth maps). */
export const MIN_ARC_LENGTH = 14;
/** Samples along a geodesic before projecting (smoother than a single Bezier). */
const GEODESIC_SAMPLES = 24;

function minArcFor(options: MapGeometryOptions): number {
  return options.minArcLength ?? Math.max(MIN_ARC_LENGTH, options.loopSize * 0.5);
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

/** A loop that leaves `at` in direction `angle` and returns to it. */
export function loopPath(at: Point, angle: number, size: number): Shape {
  const reach = size * LOOP_REACH;
  const c1 = {
    x: at.x + reach * Math.cos(angle - LOOP_SPREAD),
    y: at.y + reach * Math.sin(angle - LOOP_SPREAD),
  };
  const c2 = {
    x: at.x + reach * Math.cos(angle + LOOP_SPREAD),
    y: at.y + reach * Math.sin(angle + LOOP_SPREAD),
  };
  // Midpoint of a cubic whose two ends are the same point.
  const out = 0.75 * reach * Math.cos(LOOP_SPREAD);
  return {
    d: `M${round(at.x)} ${round(at.y)}C${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(at.x)} ${round(at.y)}`,
    tip: { x: at.x + out * Math.cos(angle), y: at.y + out * Math.sin(angle) },
    points: sample([at, c1, c2, at]),
  };
}

/** Direction and size of the nth loop in one country. */
export function loopPlacement(index: number, baseSize: number): { angle: number; size: number } {
  return {
    angle: -Math.PI / 2 + index * GOLDEN_ANGLE,
    size: baseSize * Math.min(LOOP_MAX_SCALE, 1 + LOOP_GROWTH * index),
  };
}

/** How far the nth line between the same two countries bows, as a share of its length. */
export function arcBow(index: number): number {
  const step = Math.floor(index / 2);
  // Wider fan than before so European stacks don't sit on top of each other.
  const magnitude = 0.22 + 0.18 * step;
  return index % 2 === 0 ? magnitude : -magnitude;
}

/** SVG path + tip from a polyline of projected points, with optional screen-space bow. */
export function pathFromPoints(
  raw: readonly Point[],
  bow = 0,
  minLength = MIN_ARC_LENGTH,
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
  minLength = MIN_ARC_LENGTH,
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
export function arcPath(a: Point, b: Point, bow: number): Shape {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  // Unit normal, flipped if needed so a positive bow always points up the map.
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
  const shape = pathFromPoints(sample([a, control, b]), 0);
  if (shape) return shape;
  return {
    d: `M${round(a.x)} ${round(a.y)}Q${round(control.x)} ${round(control.y)} ${round(b.x)} ${round(b.y)}`,
    tip: {
      x: 0.25 * a.x + 0.5 * control.x + 0.25 * b.x,
      y: 0.25 * a.y + 0.5 * control.y + 0.25 * b.y,
    },
    points: sample([a, control, b]),
  };
}

export type ProjectCountry = (countryCode: string) => Point | null;
export type ProjectLonLat = (lonLat: [number, number]) => Point | null;

type Placed = { code: string; point: Point };

/**
 * Lines + endpoint markers for Waves.
 * Prefer precise lon/lat when present; otherwise country centroids.
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
    return point ? { code: normalized, point } : null;
  };
  const placeLonLat = (
    lonLat: [number, number] | null | undefined,
    code: string | null,
  ): Placed | null => {
    if (lonLat && projectLonLat) {
      const point = projectLonLat(lonLat);
      if (point) {
        return { code: normalizeCountryCode(code) ?? "XX", point };
      }
    }
    return placeCountry(code);
  };
  const fallback = placeCountry(options.fallbackCountry ?? null) ?? placeCountry(SOMEWHERE);
  const minArc = minArcFor(options);

  const arcCounts = new Map<string, number>();
  const loopCounts = new Map<string, number>();
  const lines: MapLine[] = [];
  const markers: MapMarker[] = [];

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

    markers.push({
      waveId: wave.id,
      side: "mine",
      photoId: wave.id, // caller overwrites via separate marker build when photo ids known
      point: mine.point,
    });
    markers.push({
      waveId: wave.id,
      side: "theirs",
      photoId: wave.id,
      point: theirs.point,
    });

    if (mine.code === theirs.code && !wave.mineLonLat && !wave.theirsLonLat) {
      const index = loopCounts.get(mine.code) ?? 0;
      loopCounts.set(mine.code, index + 1);
      const { angle, size } = loopPlacement(index, options.loopSize);
      lines.push({ waveId: wave.id, kind: "loop", ...loopPath(mine.point, angle, size) });
      continue;
    }

    // Same-country but distinct GPS: still draw a short arc between points.
    if (mine.point.x === theirs.point.x && mine.point.y === theirs.point.y) {
      const index = loopCounts.get(mine.code) ?? 0;
      loopCounts.set(mine.code, index + 1);
      const { angle, size } = loopPlacement(index, options.loopSize);
      lines.push({ waveId: wave.id, kind: "loop", ...loopPath(mine.point, angle, size) });
      continue;
    }

    const chord = Math.hypot(mine.point.x - theirs.point.x, mine.point.y - theirs.point.y);
    if (chord < minArc) {
      // Hairline clutter (common in the European sample pile) — keep pins only.
      continue;
    }

    const key =
      mine.code === theirs.code
        ? `${mine.code}|${mine.point.x.toFixed(1)},${mine.point.y.toFixed(1)}|${theirs.point.x.toFixed(1)},${theirs.point.y.toFixed(1)}`
        : mine.code < theirs.code
          ? `${mine.code}|${theirs.code}`
          : `${theirs.code}|${mine.code}`;
    const index = arcCounts.get(key) ?? 0;
    arcCounts.set(key, index + 1);
    const bow = arcBow(index);

    const mineLon =
      wave.mineLonLat ??
      (centroidLonLatForCountry(mine.code) as [number, number] | null);
    const theirsLon =
      wave.theirsLonLat ??
      (centroidLonLatForCountry(theirs.code) as [number, number] | null);

    let shape: Shape | null = null;
    if (mineLon && theirsLon && projectLonLat) {
      shape = geodesicArcPath(mineLon, theirsLon, projectLonLat, bow, minArc);
    }
    if (!shape) {
      const [first, second] =
        mine.code === theirs.code
          ? [mine, theirs]
          : mine.code < theirs.code
            ? [mine, theirs]
            : [theirs, mine];
      if (Math.hypot(first.point.x - second.point.x, first.point.y - second.point.y) < minArc) {
        continue;
      }
      shape = arcPath(first.point, second.point, bow);
    }
    lines.push({ waveId: wave.id, kind: "arc", ...shape });
  }
  return { lines, markers };
}

/** Markers for Wave endpoints with real photo ids. */
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
  const withIds = markers.map((m) => {
    const wave = waves.find((w) => w.id === m.waveId);
    if (!wave) return m;
    return {
      ...m,
      photoId: m.side === "mine" ? wave.mine.photoId : wave.theirs.photoId,
    };
  });
  // Several Waves can share one capture spot (e.g. sample "mine" in London).
  // Fan them out so each current-photo pin stays independently tappable.
  return spreadCoincidentMarkers(withIds, options.loopSize * 0.35);
}

/**
 * Nudge markers that sit on the same map point into a small spiral so each
 * keeps a distinct hit target.
 */
export function spreadCoincidentMarkers(
  markers: readonly MapMarker[],
  radius: number,
): MapMarker[] {
  const groups = new Map<string, number>();
  return markers.map((marker) => {
    const key = `${marker.side}:${marker.point.x.toFixed(1)},${marker.point.y.toFixed(1)}`;
    const index = groups.get(key) ?? 0;
    groups.set(key, index + 1);
    if (index === 0) return marker;
    const angle = -Math.PI / 2 + index * GOLDEN_ANGLE;
    const reach = radius * (0.55 + 0.2 * index);
    return {
      ...marker,
      point: {
        x: marker.point.x + reach * Math.cos(angle),
        y: marker.point.y + reach * Math.sin(angle),
      },
    };
  });
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
 * Only lines passing within `reach` of the touch are considered. Lines often
 * run close together, above all loops leaving the same country, so among
 * those the one whose far end is nearest the touch wins: each line's far end
 * is the part of it that no other line shares.
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
