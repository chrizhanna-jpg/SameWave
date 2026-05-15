import type { GeoProjection } from "d3-geo";

import { centroidLonLatForAtlas } from "@/utils/atlasCountryCentroids";
import { orderWavefireRingCountryCodes } from "@/utils/atlasWavefire";
import type { FirecircleParticipant } from "@/utils/firecircleParticipants";
import { FIRECIRCLE_SLOT_COUNT } from "@/utils/firecircleParticipants";

export type FirecircleTileModel = {
  x: number;
  y: number;
  /** ISO2 country this slot sits on along the Wavefire ring. */
  countryCode: string;
  userId: string;
  thumbnailUrl?: string;
  slotIndex: number;
};

function screenCentroids(
  codes: string[],
  projection: GeoProjection,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const code of codes) {
    const ll = centroidLonLatForAtlas(code);
    if (!ll) continue;
    const p = projection([ll[0], ll[1]]);
    if (!p) continue;
    out.push({ x: p[0], y: p[1] });
  }
  return out;
}

function pointOnClosedPolylineWithEdge(
  pts: { x: number; y: number }[],
  frac: number,
): { x: number; y: number; edgeStart: number } {
  const n = pts.length;
  if (n === 0) return { x: 0, y: 0, edgeStart: 0 };
  if (n === 1) {
    return { x: pts[0]!.x, y: pts[0]!.y, edgeStart: 0 };
  }
  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push(len);
    total += len;
  }
  if (total <= 0) {
    return { x: pts[0]!.x, y: pts[0]!.y, edgeStart: 0 };
  }
  let target = ((frac % 1) + 1) % 1;
  target *= total;
  for (let i = 0; i < n; i++) {
    const len = segs[i]!;
    if (target <= len || i === n - 1) {
      const a = pts[i]!;
      const b = pts[(i + 1) % n]!;
      const u = len > 0 ? Math.min(1, Math.max(0, target / len)) : 0;
      return {
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        edgeStart: i,
      };
    }
    target -= len;
  }
  return { x: pts[0]!.x, y: pts[0]!.y, edgeStart: 0 };
}

/**
 * Lay out seven tiles evenly along the closed country ring used by Wavefire.
 */
export function layoutFirecircleTiles(
  projection: GeoProjection,
  countryCodes: string[],
  participants: FirecircleParticipant[],
): FirecircleTileModel[] {
  const ordered = orderWavefireRingCountryCodes(countryCodes, projection);
  const pts = screenCentroids(ordered, projection);
  if (pts.length < 2) return [];
  const tiles: FirecircleTileModel[] = [];
  for (let slot = 0; slot < FIRECIRCLE_SLOT_COUNT; slot++) {
    const frac = (slot + 0.5) / FIRECIRCLE_SLOT_COUNT;
    const { x, y, edgeStart } = pointOnClosedPolylineWithEdge(pts, frac);
    const countryCode = ordered[edgeStart] ?? ordered[0] ?? "";
    const p = participants[slot]!;
    tiles.push({
      x,
      y,
      countryCode,
      userId: p.userId,
      thumbnailUrl: p.thumbnailUrl,
      slotIndex: slot,
    });
  }
  return tiles;
}
