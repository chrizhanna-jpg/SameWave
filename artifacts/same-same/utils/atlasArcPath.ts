import { geoEqualEarth, type GeoProjection } from "d3-geo";

import { atlasLandGeoFeature } from "@/utils/atlasWorldLand";

const CLUSTER_INSET = 12;

/** Padding inside the viewport fit box so coastlines clear the clip edge. */
const ATLAS_FIT_PAD_PX = 14;

/**
 * Equal Earth projection fitted so all land fits inside a **viewport-sized**
 * rectangle centered on the (possibly larger) map canvas. Oversampled
 * canvases keep extra ocean margin for panning; at scale 1 and default pan,
 * the user still sees the whole world.
 */
const PREVIEW_FIT_PAD_PX = 16;

/**
 * Equal Earth fitted to the two connection endpoints (or centered on one
 * country when both sides share a centroid). Used by share-card mini maps.
 */
export function createConnectionPreviewProjection(
  canvasW: number,
  canvasH: number,
  fromLonLat: readonly [number, number] | null,
  toLonLat: readonly [number, number] | null,
): GeoProjection {
  const cw = Math.max(1, canvasW);
  const ch = Math.max(1, canvasH);
  const pad = PREVIEW_FIT_PAD_PX;

  if (!fromLonLat && !toLonLat) {
    return createAtlasProjection(cw, ch, cw, ch);
  }

  const from = fromLonLat ?? toLonLat!;
  const to = toLonLat ?? fromLonLat!;
  const samePlace =
    Math.abs(from[0] - to[0]) < 0.02 && Math.abs(from[1] - to[1]) < 0.02;

  if (samePlace) {
    return geoEqualEarth()
      .center([from[0], from[1]])
      .translate([cw / 2, ch / 2])
      .scale(Math.min(cw, ch) / 2.4);
  }

  const collection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [from[0], from[1]] },
      },
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [to[0], to[1]] },
      },
    ],
  };

  return geoEqualEarth().fitExtent(
    [
      [pad, pad],
      [cw - pad, ch - pad],
    ],
    collection as Parameters<GeoProjection["fitExtent"]>[1],
  );
}

export function createAtlasProjection(
  canvasW: number,
  canvasH: number,
  viewW: number,
  viewH: number,
): GeoProjection {
  const vw = Number.isFinite(viewW) ? Math.max(1, viewW) : 1;
  const vh = Number.isFinite(viewH) ? Math.max(1, viewH) : 1;
  const cw = Number.isFinite(canvasW) ? Math.max(1, canvasW) : 1;
  const ch = Number.isFinite(canvasH) ? Math.max(1, canvasH) : 1;
  const innerW = Math.max(32, vw - 2 * ATLAS_FIT_PAD_PX);
  const innerH = Math.max(32, vh - 2 * ATLAS_FIT_PAD_PX);
  const x0 = (cw - innerW) / 2;
  const y0 = (ch - innerH) / 2;
  const x1 = x0 + innerW;
  const y1 = y0 + innerH;
  return geoEqualEarth().fitExtent(
    [
      [x0, y0],
      [x1, y1],
    ],
    atlasLandGeoFeature as Parameters<GeoProjection["fitExtent"]>[1],
  );
}

/**
 * Quadratic arc in projected pixel space (inset endpoints so lines meet
 * cluster edges — same idea as the web mockup).
 */
function arcPathFromSegment(seg: AtlasArcSegment): string {
  if (seg.mode === "line") {
    return `M${seg.x1},${seg.y1} L${seg.x2},${seg.y2}`;
  }
  return `M${seg.sx},${seg.sy} Q${seg.cx},${seg.cy} ${seg.ex},${seg.ey}`;
}

export function atlasArcPathD(
  projection: GeoProjection,
  fromLonLat: readonly [number, number],
  toLonLat: readonly [number, number],
): string {
  const seg = atlasArcSegment(projection, fromLonLat, toLonLat);
  if (!seg) return "";
  return arcPathFromSegment(seg);
}

export type AtlasScreenPoint = { x: number; y: number };

const WAVEFIRE_RING_INSET = 5;
const WAVEFIRE_RING_BOW_MAX = 32;

/**
 * One continuous ember ring through country centroids (closed loop). Each leg is
 * a shallow quadratic bow with a very subtle wobble so the string reads alive
 * without looking squiggly.
 */
export function atlasWavefireRingPathD(
  ringPoints: AtlasScreenPoint[],
  wavePhase: number,
): string {
  const n = ringPoints.length;
  if (n < 2) return "";
  const cx =
    ringPoints.reduce((s, p) => s + p.x, 0) / n;
  const cy =
    ringPoints.reduce((s, p) => s + p.y, 0) / n;
  const centroid = { x: cx, y: cy };

  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = ringPoints[i]!;
    const b = ringPoints[(i + 1) % n]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) continue;
    const ux = dx / len;
    const uy = dy / len;
    const inset = Math.min(WAVEFIRE_RING_INSET, len * 0.32);
    const sx = a.x + ux * inset;
    const sy = a.y + uy * inset;
    const ex = b.x - ux * inset;
    const ey = b.y - uy * inset;
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;
    const vx = mx - centroid.x;
    const vy = my - centroid.y;
    const vlen = Math.hypot(vx, vy) || 1;
    const nx = vx / vlen;
    const ny = vy / vlen;
    const bow = Math.min(len * 0.2, WAVEFIRE_RING_BOW_MAX);
    const wobble = Math.sin(wavePhase + i * 0.45) * 2.2;
    const px = -uy;
    const py = ux;
    const qcx = mx + nx * bow + px * wobble;
    const qcy = my + ny * bow + py * wobble;
    if (parts.length === 0) {
      parts.push(`M${sx},${sy} Q${qcx},${qcy} ${ex},${ey}`);
    } else {
      parts.push(`Q${qcx},${qcy} ${ex},${ey}`);
    }
  }
  return parts.join(" ");
}

export type AtlasArcSegment =
  | { mode: "line"; x1: number; y1: number; x2: number; y2: number }
  | {
      mode: "quad";
      sx: number;
      sy: number;
      cx: number;
      cy: number;
      ex: number;
      ey: number;
    };

/** Pixel-space arc segment for animation sampling (matches {@link atlasArcPathD}). */
export function atlasArcSegment(
  projection: GeoProjection,
  fromLonLat: readonly [number, number],
  toLonLat: readonly [number, number],
): AtlasArcSegment | null {
  const a = projection(fromLonLat as [number, number]);
  const b = projection(toLonLat as [number, number]);
  if (!a || !b) return null;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len <= CLUSTER_INSET * 2) {
    return { mode: "line", x1, y1, x2, y2 };
  }
  const ux = dx / len;
  const uy = dy / len;
  const sx = x1 + ux * CLUSTER_INSET;
  const sy = y1 + uy * CLUSTER_INSET;
  const ex = x2 - ux * CLUSTER_INSET;
  const ey = y2 - uy * CLUSTER_INSET;
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;
  const newLen = len - CLUSTER_INSET * 2;
  const bow = Math.min(newLen * 0.22, 70);
  const cx = mx;
  const cy = my - bow;
  return { mode: "quad", sx, sy, cx, cy, ex, ey };
}

function quadPoint(
  sx: number,
  sy: number,
  cx: number,
  cy: number,
  ex: number,
  ey: number,
  t: number,
): { x: number; y: number } {
  const u = Math.max(0, Math.min(1, t));
  const o = 1 - u;
  return {
    x: o * o * sx + 2 * o * u * cx + u * u * ex,
    y: o * o * sy + 2 * o * u * cy + u * u * ey,
  };
}

/** Point at parameter t ∈ [0, 1] along the arc (straight or quadratic). */
export function atlasArcPointAt(
  seg: AtlasArcSegment,
  t: number,
): { x: number; y: number } {
  if (seg.mode === "line") {
    const u = Math.max(0, Math.min(1, t));
    return {
      x: seg.x1 + (seg.x2 - seg.x1) * u,
      y: seg.y1 + (seg.y2 - seg.y1) * u,
    };
  }
  return quadPoint(seg.sx, seg.sy, seg.cx, seg.cy, seg.ex, seg.ey, t);
}

/** Approximate arc length in pixels (for dash / timing). */
export function atlasArcLength(seg: AtlasArcSegment): number {
  if (seg.mode === "line") {
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    return Math.sqrt(dx * dx + dy * dy) || 1;
  }
  const steps = 32;
  let len = 0;
  let px = seg.sx;
  let py = seg.sy;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const { x, y } = quadPoint(
      seg.sx,
      seg.sy,
      seg.cx,
      seg.cy,
      seg.ex,
      seg.ey,
      t,
    );
    len += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  return Math.max(len, 8);
}
