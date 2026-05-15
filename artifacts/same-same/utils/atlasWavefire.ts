import type { GeoProjection } from "d3-geo";

import type { AtlasConnection } from "@/utils/api";
import { centroidLonLatForAtlas } from "@/utils/atlasCountryCentroids";

export type WavefireCluster = {
  /** Stable lowercase seed for ring animation / hashing (not always a single theme). */
  theme: string;
  /** Short label for the stats panel (theme, vibe tag, or subject). */
  displayTheme: string;
  connections: AtlasConnection[];
  countryCodes: string[];
};

const THEME_MIN_LEN = 2;

class UnionFind {
  private readonly parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    let x = i;
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

type ConnFeat = {
  c: AtlasConnection;
  theme: string;
  tags: Set<string>;
  subjects: Set<string>;
};

function toFeat(c: AtlasConnection): ConnFeat {
  const theme = (c.theme ?? "").trim().toLowerCase();
  const tags = new Set(
    (c.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
  );
  const subjects = new Set(
    (c.subjects ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
  );
  return { c, theme, tags, subjects };
}

function themesOverlap(a: string, b: string): boolean {
  if (a.length < THEME_MIN_LEN || b.length < THEME_MIN_LEN) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

function setsOverlap(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  for (const t of a) {
    if (b.has(t)) return true;
  }
  return false;
}

function linked(a: ConnFeat, b: ConnFeat): boolean {
  return (
    themesOverlap(a.theme, b.theme) ||
    setsOverlap(a.tags, b.tags) ||
    setsOverlap(a.subjects, b.subjects)
  );
}

function pickDisplayTheme(list: AtlasConnection[]): string {
  let bestTheme = "";
  for (const c of list) {
    const t = (c.theme ?? "").trim();
    if (t.length >= THEME_MIN_LEN && t.length > bestTheme.length) {
      bestTheme = t;
    }
  }
  if (bestTheme) return bestTheme;

  const tagCounts = new Map<string, number>();
  for (const c of list) {
    for (const t of c.tags ?? []) {
      const k = t.trim().toLowerCase();
      if (!k) continue;
      tagCounts.set(k, (tagCounts.get(k) ?? 0) + 1);
    }
  }
  let bestTag = "";
  let bestTagN = 0;
  for (const [k, n] of tagCounts) {
    if (n > bestTagN) {
      bestTagN = n;
      bestTag = k;
    }
  }
  if (bestTag) return bestTag;

  const subCounts = new Map<string, number>();
  for (const c of list) {
    for (const s of c.subjects ?? []) {
      const k = s.trim().toLowerCase();
      if (!k) continue;
      subCounts.set(k, (subCounts.get(k) ?? 0) + 1);
    }
  }
  let bestSub = "";
  let bestSubN = 0;
  for (const [k, n] of subCounts) {
    if (n > bestSubN) {
      bestSubN = n;
      bestSub = k;
    }
  }
  if (bestSub) return bestSub;
  return "Shared moments";
}

function clusterSeedKey(list: AtlasConnection[], display: string): string {
  const ids = list.map((x) => x.id).sort();
  return `${display.trim().toLowerCase()}:${ids.join(",")}`;
}

/**
 * Order distinct ISO2 codes around the mean of their projected map positions
 * so a polyline through them reads like a ring / string on the globe (not
 * random hop order from the Set iteration).
 */
export function orderWavefireRingCountryCodes(
  codes: string[],
  projection: GeoProjection,
): string[] {
  if (codes.length < 3) return [...codes];
  const pts = codes
    .map((code) => {
      const ll = centroidLonLatForAtlas(code);
      if (!ll) return null;
      const p = projection([ll[0], ll[1]]);
      if (!p) return null;
      return { code: code.trim().toUpperCase(), x: p[0], y: p[1] };
    })
    .filter((x): x is { code: string; x: number; y: number } => x != null);
  if (pts.length < 3) return [...codes];
  const mx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
  const my = pts.reduce((s, q) => s + q.y, 0) / pts.length;
  const withAngle = pts.map((q) => ({
    code: q.code,
    ang: Math.atan2(q.y - my, q.x - mx),
  }));
  withAngle.sort((a, b) => a.ang - b.ang);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const w of withAngle) {
    if (seen.has(w.code)) continue;
    seen.add(w.code);
    ordered.push(w.code);
  }
  return ordered.length >= 3 ? ordered : [...codes];
}

/**
 * Client-side Wavefire: groups recent echo arcs when they link by **theme OR
 * shared vibe tags OR shared subjects** (transitive closure), require ≥
 * `minEvents` arcs and ≥ `minCountries` distinct ISO2 endpoints in the window.
 */
export function detectWavefireCluster(
  connections: AtlasConnection[],
  windowMs: number,
  minEvents: number,
  minCountries: number,
): WavefireCluster | null {
  const now = Date.now();
  const recentAll = connections.filter((c) => {
    const t = Date.parse(c.createdAt);
    return Number.isFinite(t) && now - t <= windowMs;
  });

  const feats = recentAll
    .map(toFeat)
    .filter(
      (f) =>
        f.theme.length >= THEME_MIN_LEN ||
        f.tags.size > 0 ||
        f.subjects.size > 0,
    );

  if (feats.length < minEvents) return null;

  const uf = new UnionFind(feats.length);
  for (let i = 0; i < feats.length; i++) {
    for (let j = i + 1; j < feats.length; j++) {
      if (linked(feats[i], feats[j])) uf.union(i, j);
    }
  }

  const buckets = new Map<number, AtlasConnection[]>();
  for (let i = 0; i < feats.length; i++) {
    const r = uf.find(i);
    const row = buckets.get(r);
    if (row) row.push(feats[i].c);
    else buckets.set(r, [feats[i].c]);
  }

  let best: WavefireCluster | null = null;
  for (const list of buckets.values()) {
    if (list.length < minEvents) continue;
    const countries = new Set<string>();
    for (const c of list) {
      countries.add(c.from);
      countries.add(c.to);
    }
    if (countries.size < minCountries) continue;
    if (!best || list.length > best.connections.length) {
      const displayTheme = pickDisplayTheme(list);
      const theme = clusterSeedKey(list, displayTheme);
      best = {
        theme,
        displayTheme,
        connections: list,
        countryCodes: [...countries],
      };
    }
  }
  return best;
}
