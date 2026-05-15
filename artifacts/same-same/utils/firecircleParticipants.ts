import type { AtlasConnection } from "@/utils/api";

export const FIRECIRCLE_SLOT_COUNT = 7;

function parseCreatedMs(c: AtlasConnection): number {
  const t = Date.parse(c.createdAt);
  return Number.isFinite(t) ? t : 0;
}

export type FirecircleParticipant = {
  userId: string;
  thumbnailUrl?: string;
};

/**
 * Up to seven distinct users from recent cluster rows (by `userId`), newest first.
 * Pads with anonymous slots so the ring always has seven visual anchors.
 */
export function pickFirecircleParticipants(
  connections: AtlasConnection[],
): FirecircleParticipant[] {
  const best = new Map<string, { userId: string; thumbnailUrl?: string; t: number }>();
  for (const c of connections) {
    const userId = (c.userId ?? "").trim();
    if (!userId) continue;
    const t = parseCreatedMs(c);
    const prev = best.get(userId);
    if (!prev || t >= prev.t) {
      const thumb = (c.thumbnailUrl ?? "").trim();
      best.set(userId, {
        userId,
        thumbnailUrl: thumb.length > 0 ? thumb : undefined,
        t,
      });
    }
  }
  const rows = [...best.values()]
    .sort((a, b) => b.t - a.t)
    .map(({ userId, thumbnailUrl }) => ({ userId, thumbnailUrl }))
    .slice(0, FIRECIRCLE_SLOT_COUNT);
  let i = 0;
  while (rows.length < FIRECIRCLE_SLOT_COUNT) {
    rows.push({ userId: `firecircle-anon-${i++}`, thumbnailUrl: undefined });
  }
  return rows;
}
