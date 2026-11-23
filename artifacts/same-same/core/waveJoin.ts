/**
 * The soft join between the two full-screen photographs on a Wave / Match.
 * One shared curve in screen space drives both photo clips and the stroke,
 * so they stay aligned at every size (including tall phones).
 */

import { waveJoin } from "@/theme";

export type Point = { x: number; y: number };

export type WaveCurve = {
  start: Point;
  curves: { c1: Point; c2: Point; end: Point }[];
};

/** Band height for the join, in points — wide enough for the logo crests. */
export function joinBandHeight(width: number): number {
  return Math.max(36, Math.round(width * waveJoin.amplitude * 2.4));
}

/**
 * Control points for the logo ribbon inside a band of `bandHeight`.
 * y=0 is the top of the band; the stroke sits near the vertical middle.
 */
export function logoWaveCurve(width: number, bandHeight: number): WaveCurve {
  const mid = bandHeight / 2;
  const amp = bandHeight * 0.38;
  const y = (n: number) => mid - amp * n;
  const x = (n: number) => width * n;
  return {
    start: { x: x(0), y: y(-0.15) },
    curves: [
      { c1: { x: x(0.08), y: y(-0.05) }, c2: { x: x(0.16), y: y(0.85) }, end: { x: x(0.32), y: y(1) } },
      { c1: { x: x(0.42), y: y(1) }, c2: { x: x(0.48), y: y(0.15) }, end: { x: x(0.58), y: y(-0.35) } },
      { c1: { x: x(0.66), y: y(-0.7) }, c2: { x: x(0.72), y: y(0.35) }, end: { x: x(0.78), y: y(0.55) } },
      { c1: { x: x(0.86), y: y(0.75) }, c2: { x: x(0.94), y: y(0.05) }, end: { x: x(1), y: y(-0.2) } },
    ],
  };
}

function lift(curve: WaveCurve, dy: number): WaveCurve {
  const t = (p: Point): Point => ({ x: p.x, y: p.y + dy });
  return {
    start: t(curve.start),
    curves: curve.curves.map((c) => ({ c1: t(c.c1), c2: t(c.c2), end: t(c.end) })),
  };
}

function strokePath(curve: WaveCurve): string {
  const parts = [`M ${curve.start.x} ${curve.start.y}`];
  for (const c of curve.curves) {
    parts.push(`C ${c.c1.x} ${c.c1.y} ${c.c2.x} ${c.c2.y} ${c.end.x} ${c.end.y}`);
  }
  return parts.join(" ");
}

function reverseStroke(curve: WaveCurve): string {
  // Walk cubics backwards (swap control points) so a closed mask can hug the wave.
  const parts: string[] = [];
  for (let i = curve.curves.length - 1; i >= 0; i--) {
    const c = curve.curves[i]!;
    const prev = i === 0 ? curve.start : curve.curves[i - 1]!.end;
    parts.push(`C ${c.c2.x} ${c.c2.y} ${c.c1.x} ${c.c1.y} ${prev.x} ${prev.y}`);
  }
  return parts.join(" ");
}

/** Screen-space Y of the seam mid-line (shared by clips + stroke). */
export function seamMidY(screenHeight: number): number {
  return screenHeight / 2;
}

/** Band-local ribbon path (legacy helper). Prefer `seamStrokePath`. */
export function logoWavePath(width: number, height: number): string {
  return strokePath(logoWaveCurve(width, height));
}

/**
 * Stroke path in full-screen coordinates — same curve the clips hug.
 * The band is centred on `seamMidY(screenHeight)`.
 */
export function seamStrokePath(
  width: number,
  screenHeight: number,
  bandHeight = joinBandHeight(width),
): string {
  const top = seamMidY(screenHeight) - bandHeight / 2;
  return strokePath(lift(logoWaveCurve(width, bandHeight), top));
}

/**
 * Closed path covering everything above the wave inside a top photo box.
 * `boxHeight` must be `seamMidY + bandHeight/2` so the shared seam lands on mid.
 */
export function waveClipAbove(width: number, boxHeight: number, bandHeight: number): string {
  const curve = lift(logoWaveCurve(width, bandHeight), boxHeight - bandHeight);
  const end = curve.curves[curve.curves.length - 1]!.end;
  return [
    `M 0 0`,
    `L ${width} 0`,
    `L ${end.x} ${end.y}`,
    reverseStroke(curve),
    `L 0 0`,
    `Z`,
  ].join(" ");
}

/**
 * Closed path covering everything below the wave inside a bottom photo box.
 * The wave band sits on the top `bandHeight` of `boxHeight`.
 */
export function waveClipBelow(width: number, boxHeight: number, bandHeight: number): string {
  const curve = logoWaveCurve(width, bandHeight);
  return [
    strokePath(curve),
    `L ${width} ${boxHeight}`,
    `L 0 ${boxHeight}`,
    `Z`,
  ].join(" ");
}
