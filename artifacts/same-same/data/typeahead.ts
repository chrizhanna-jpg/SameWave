/**
 * Shared helpers for preset-only type-ahead.
 * Typing never creates a custom value — it only ranks known presets.
 */

/** Cheap edit distance for short type-ahead strings. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]!;
  }
  return prev[b.length]!;
}

/**
 * Rank presets by closeness to `query` using the provided text fields
 * (label, id, aliases, description). Always returns up to `limit` items —
 * never an empty list when the catalogue is non-empty.
 */
export function closestPresets<T>(
  items: readonly T[],
  query: string,
  textsOf: (item: T) => readonly string[],
  limit: number,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q || items.length === 0) return items.slice(0, limit) as T[];

  const ranked = items.map((item) => {
    let best = Number.POSITIVE_INFINITY;
    for (const raw of textsOf(item)) {
      const text = raw.toLowerCase().trim();
      if (!text) continue;
      best = Math.min(best, editDistance(q, text));
      if (text.startsWith(q)) best = Math.min(best, 0.25);
      else if (text.includes(q)) best = Math.min(best, 0.5 + (text.length - q.length) * 0.01);
    }
    return { item, best };
  });

  ranked.sort((a, b) => a.best - b.best);
  return ranked.slice(0, limit).map((row) => row.item);
}
