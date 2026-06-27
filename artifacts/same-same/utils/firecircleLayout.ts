import type { GeoProjection } from "d3-geo";

import type { AtlasConnection } from "@/utils/api";
import { centroidLonLatForAtlas } from "@/utils/atlasCountryCentroids";
import { photoKey } from "@/utils/photoKey";
import { FIRECIRCLE_SLOT_COUNT } from "@/utils/firecircleParticipants";

export type FirecircleTileModel = {
  x: number;
  y: number;
  /** ISO2 country for the spotlight photo (remote endpoint of the arc). */
  countryCode: string;
  userId: string;
  thumbnailUrl?: string;
  /** Echo-linked photo — avoids showing a different country's latest upload. */
  spotlightPhotoId?: string;
  slotIndex: number;
};

function parseCreatedMs(c: AtlasConnection): number {
  const t = Date.parse(c.createdAt);
  return Number.isFinite(t) ? t : 0;
}

function spotlightKey(c: AtlasConnection): string {
  // Content hash first: the same image stored under several photo ids (seed
  // dupes / re-uploads) collapses to one ring tile even when its ids differ.
  const hash = (c.spotlightContentHash ?? "").trim();
  if (hash) return `hash:${hash}`;
  const id = (c.spotlightPhotoId ?? "").trim();
  if (id) return `photo:${id}`;
  const thumb = (c.thumbnailUrl ?? "").trim();
  if (thumb) return `uri:${photoKey(thumb)}`;
  return `conn:${c.id}`;
}

/**
 * One tile per distinct ripple/wave photo, placed on the remote country
 * centroid. Skips duplicate photos even when the cluster spans many slots.
 */
export function buildFirecircleTiles(
  projection: GeoProjection,
  connections: AtlasConnection[],
): FirecircleTileModel[] {
  const seen = new Set<string>();
  const sorted = [...connections].sort(
    (a, b) => parseCreatedMs(b) - parseCreatedMs(a),
  );
  const tiles: FirecircleTileModel[] = [];

  for (const c of sorted) {
    const key = spotlightKey(c);
    if (seen.has(key)) continue;
    seen.add(key);

    const countryCode = c.to.trim().toUpperCase();
    const ll = centroidLonLatForAtlas(countryCode);
    if (!ll) continue;
    const p = projection([ll[0], ll[1]]);
    if (!p) continue;

    const userId = (c.userId ?? c.spotlightPhotoId ?? c.id).trim();
    tiles.push({
      x: p[0],
      y: p[1],
      countryCode,
      userId: userId || `firecircle-${c.id}`,
      thumbnailUrl: c.thumbnailUrl,
      spotlightPhotoId: c.spotlightPhotoId,
      slotIndex: tiles.length,
    });
    if (tiles.length >= FIRECIRCLE_SLOT_COUNT) break;
  }

  return tiles;
}
