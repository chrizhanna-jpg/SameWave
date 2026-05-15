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
export function atlasArcPathD(
  projection: GeoProjection,
  fromLonLat: readonly [number, number],
  toLonLat: readonly [number, number],
): string {
  const seg = atlasArcSegment(projection, fromLonLat, toLonLat);
  if (!seg) return "";
  if (seg.mode === "line") {
    return `M${seg.x1},${seg.y1} L${seg.x2},${seg.y2}`;
  }
  return `M${seg.sx},${seg.sy} Q${seg.cx},${seg.cy} ${seg.ex},${seg.ey}`;
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
