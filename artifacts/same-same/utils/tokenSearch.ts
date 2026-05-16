/** True when `query` matches `text` (substring, word prefix, or ordered subsequence). */
export function tokenMatchesQuery(query: string, text: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const t = text.toLowerCase();
  if (!t) return false;
  if (t.includes(q)) return true;
  if (t.split(/\s+/).some((word) => word.startsWith(q))) return true;
  let j = 0;
  for (let i = 0; i < t.length && j < q.length; i++) {
    if (t[i] === q[j]) j++;
  }
  return j === q.length;
}

export function tokenMatchesAnyQuery(query: string, texts: string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return texts.some((text) => tokenMatchesQuery(q, text));
}

/** Higher = better fit for sorting chip rows while typing. */
export function tokenMatchScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  if (!t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.split(/\s+/).some((word) => word.startsWith(q))) return 80;
  if (t.includes(q)) return 70;
  let j = 0;
  for (let i = 0; i < t.length && j < q.length; i++) {
    if (t[i] === q[j]) j++;
  }
  return j === q.length ? 50 : 0;
}

export function bestTokenMatchScore(query: string, texts: string[]): number {
  return Math.max(0, ...texts.map((text) => tokenMatchScore(query, text)));
}
