/**
 * Shapes for the Waves map. One line per Wave.
 *
 * Two countries: a curved line between them. Several Waves between the same
 * two countries fan out so each can be tapped.
 * One country: a soft loop that leaves the country and returns. Loops in the
 * same country spread in angle and size so each can be tapped.
 */
import { normalizeCountryCode } from "../data/countries";

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
}

/** Where a Wave is drawn when no country is known: open water in the Atlantic. */
export const SOMEWHERE = "ZZ";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const LOOP_SPREAD = 0.6;
const LOOP_REACH = 1.35;
const LOOP_GROWTH = 0.12;
const LOOP_MAX_SCALE = 2.2;

const SAMPLES = 16;

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
  const magnitude = 0.2 + 0.13 * step;
  return index % 2 === 0 ? magnitude : -magnitude;
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
  return {
    d: `M${round(a.x)} ${round(a.y)}Q${round(control.x)} ${round(control.y)} ${round(b.x)} ${round(b.y)}`,
    tip: {
      x: 0.25 * a.x + 0.5 * control.x + 0.25 * b.x,
      y: 0.25 * a.y + 0.5 * control.y + 0.25 * b.y,
    },
    points: sample([a, control, b]),
  };
}

export function buildMapLines(
  waves: readonly MapWaveInput[],
  project: (countryCode: string) => Point | null,
  options: MapGeometryOptions,
): MapLine[] {
  const place = (code: string | null): { code: string; point: Point } | null => {
    const normalized = normalizeCountryCode(code);
    if (!normalized) return null;
    const point = project(normalized);
    return point ? { code: normalized, point } : null;
  };
  const fallback = place(options.fallbackCountry ?? null) ?? place(SOMEWHERE);

  const arcCounts = new Map<string, number>();
  const loopCounts = new Map<string, number>();
  const lines: MapLine[] = [];

  for (const wave of waves) {
    // A side with no known country sits with the other side.
    const mine = place(wave.mine) ?? place(wave.theirs) ?? fallback;
    const theirs = place(wave.theirs) ?? place(wave.mine) ?? fallback;
    if (!mine || !theirs) continue;

    if (mine.code === theirs.code) {
      const index = loopCounts.get(mine.code) ?? 0;
      loopCounts.set(mine.code, index + 1);
      const { angle, size } = loopPlacement(index, options.loopSize);
      lines.push({ waveId: wave.id, kind: "loop", ...loopPath(mine.point, angle, size) });
      continue;
    }

    const [first, second] = mine.code < theirs.code ? [mine, theirs] : [theirs, mine];
    const key = `${first.code}|${second.code}`;
    const index = arcCounts.get(key) ?? 0;
    arcCounts.set(key, index + 1);
    lines.push({
      waveId: wave.id,
      kind: "arc",
      ...arcPath(first.point, second.point, arcBow(index)),
    });
  }
  return lines;
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
