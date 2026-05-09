import { geoEqualEarth, type GeoProjection } from "d3-geo";

const CLUSTER_INSET = 12;

/** Build Equal Earth projection matching the mockup Atlas proportions. */
export function createAtlasProjection(
  width: number,
  height: number,
): GeoProjection {
  const scale = Math.min(width, height) * 0.42;
  return geoEqualEarth()
    .scale(scale)
    .center([15, 8])
    .translate([width / 2, height / 2]);
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
  const a = projection(fromLonLat as [number, number]);
  const b = projection(toLonLat as [number, number]);
  if (!a || !b) return "";
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len <= CLUSTER_INSET * 2) {
    return `M${x1},${y1} L${x2},${y2}`;
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
  return `M${sx},${sy} Q${cx},${cy} ${ex},${ey}`;
}
