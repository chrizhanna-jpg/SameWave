import type { GeoProjection } from "d3-geo";

import {
  DAILY_CHALLENGES,
  fireClusterThemesMatch,
  resolveChallengeThemeId,
} from "@/data/themeMatch";
import type { AtlasConnection } from "@/utils/api";
import { centroidLonLatForAtlas } from "@/utils/atlasCountryCentroids";

/** Echo arcs from `GET /api/photos/atlas` (shared across all signed-in users). */
export function isServerHeldAtlasConnection(c: AtlasConnection): boolean {
  return !c.id.startsWith("local-");
}

export function filterServerHeldAtlasConnections(
  connections: AtlasConnection[],
): AtlasConnection[] {
  return connections.filter(isServerHeldAtlasConnection);
}

export type AtlasThemeCluster = {
  /** Stable lowercase seed for ring animation / hashing (not always a single theme). */
  theme: string;
  /** Short label for the stats panel (theme, vibe tag, or subject). */
  displayTheme: string;
  connections: AtlasConnection[];
  countryCodes: string[];
};

/** @deprecated Use {@link AtlasThemeCluster} */
export type WavefireCluster = AtlasThemeCluster;

const THEME_MIN_LEN = 2;

/** Vibe tags too broad to form a Ripplefire / Wavefire cluster on their own. */
const GENERIC_CLUSTER_TAGS = new Set([
  "warm",
  "cozy",
  "home",
  "people",
  "outdoors",
  "art",
  "city",
  "travel",
  "smile",
  "friends",
  "family",
  "night",
  "happy",
  "fun",
  "life",
  "day",
  "weekend",
]);

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
  let theme = (c.theme ?? "").trim().toLowerCase();
  const tags = new Set(
    (c.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
  );
  const subjects = new Set(
    (c.subjects ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
  );
  // Ripples without AI metadata still get their own cluster (minEvents=1)
  // without merging every orphan into one giant "ripple" bucket.
  if (
    c.kind === "ripple" &&
    theme.length < THEME_MIN_LEN &&
    tags.size === 0 &&
    subjects.size === 0
  ) {
    theme = `__solo_${c.id}`;
  }
  return { c, theme, tags, subjects };
}

function themesOverlap(a: string, b: string): boolean {
  if (a.startsWith("__solo_") || b.startsWith("__solo_")) return false;
  if (a.length < THEME_MIN_LEN || b.length < THEME_MIN_LEN) return false;
  return fireClusterThemesMatch(a, b);
}

function meaningfulTagOverlap(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  for (const t of a) {
    if (GENERIC_CLUSTER_TAGS.has(t)) continue;
    if (b.has(t)) return true;
  }
  return false;
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
    meaningfulTagOverlap(a.tags, b.tags) ||
    setsOverlap(a.subjects, b.subjects)
  );
}

function challengeTitleForId(id: string): string {
  const meta = DAILY_CHALLENGES.find((c) => c.id === id);
  return meta?.title ?? id;
}

function buildThemeAnchoredCluster(
  canonicalId: string,
  list: AtlasConnection[],
  minEvents: number,
  minCountries: number,
): AtlasThemeCluster | null {
  if (list.length < minEvents) return null;
  const countries = new Set<string>();
  for (const c of list) {
    countries.add(c.from);
    countries.add(c.to);
  }
  if (countries.size < minCountries) return null;
  const displayTheme = pickDisplayTheme(list) || challengeTitleForId(canonicalId);
  return {
    theme: canonicalId,
    displayTheme,
    connections: list,
    countryCodes: [...countries],
  };
}

/**
 * Ripplefire rings anchor on one daily-challenge theme — not vibe-tag bridges
 * (e.g. sky must not merge into nature via shared "outdoors" tags).
 */
export function detectThemeAnchoredRippleClusters(
  connections: AtlasConnection[],
  windowMs: number,
  minEvents: number,
  minCountries: number,
): AtlasThemeCluster[] {
  const now = Date.now();
  const recentRipples = connections.filter((c) => {
    if (c.kind !== "ripple") return false;
    const t = Date.parse(c.createdAt);
    return Number.isFinite(t) && now - t <= windowMs;
  });

  const buckets = new Map<string, AtlasConnection[]>();
  const unscoped: AtlasConnection[] = [];

  for (const c of recentRipples) {
    const canonicalId = resolveChallengeThemeId((c.theme ?? "").trim());
    if (canonicalId) {
      const row = buckets.get(canonicalId);
      if (row) row.push(c);
      else buckets.set(canonicalId, [c]);
    } else {
      unscoped.push(c);
    }
  }

  const clusters: AtlasThemeCluster[] = [];
  for (const [canonicalId, list] of buckets) {
    const cluster = buildThemeAnchoredCluster(
      canonicalId,
      list,
      minEvents,
      minCountries,
    );
    if (cluster) clusters.push(cluster);
  }

  // Ripples without a resolvable daily theme stay solo — never tag-merge across themes.
  for (const c of unscoped) {
    if (minEvents > 1) continue;
    const cluster = buildThemeAnchoredCluster(`__solo_${c.id}`, [c], 1, minCountries);
    if (cluster) {
      cluster.displayTheme = pickDisplayTheme([c]);
      clusters.push(cluster);
    }
  }

  clusters.sort((a, b) => b.connections.length - a.connections.length);
  return clusters;
}

/** Whether a photo's theme belongs in a fire-ring explore carousel. */
export function clusterThemesAlign(
  clusterTheme: string,
  photoTheme: string,
): boolean {
  const cluster = clusterTheme.trim();
  const photo = photoTheme.trim();
  if (!cluster || !photo) return true;
  return fireClusterThemesMatch(cluster, photo);
}

function pickDisplayTheme(list: AtlasConnection[]): string {
  const idCounts = new Map<string, { count: number; bestLabel: string }>();
  for (const c of list) {
    const t = (c.theme ?? "").trim();
    if (t.length < THEME_MIN_LEN) continue;
    const id = resolveChallengeThemeId(t);
    if (!id) continue;
    const cur = idCounts.get(id);
    if (!cur) idCounts.set(id, { count: 1, bestLabel: t });
    else {
      cur.count++;
      if (t.length > cur.bestLabel.length) cur.bestLabel = t;
    }
  }
  let best: { count: number; bestLabel: string } | null = null;
  for (const entry of idCounts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  if (best) return best.bestLabel;

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
 * Groups recent atlas arcs of one kind (`ripple` or mutual `wave`) when they link
 * by **theme OR shared vibe tags OR shared subjects** (transitive closure).
 */
export function detectAtlasThemeClusters(
  connections: AtlasConnection[],
  windowMs: number,
  minEvents: number,
  minCountries: number,
  kind: AtlasConnection["kind"],
): AtlasThemeCluster[] {
  const now = Date.now();
  const recentAll = connections.filter((c) => {
    if (c.kind !== kind) return false;
    const t = Date.parse(c.createdAt);
    return Number.isFinite(t) && now - t <= windowMs;
  });

  const feats = recentAll.map(toFeat);

  if (feats.length < minEvents) return [];

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

  const clusters: AtlasThemeCluster[] = [];
  for (const list of buckets.values()) {
    if (list.length < minEvents) continue;
    const countries = new Set<string>();
    for (const c of list) {
      countries.add(c.from);
      countries.add(c.to);
    }
    if (countries.size < minCountries) continue;
    const displayTheme = pickDisplayTheme(list);
    const theme = clusterSeedKey(list, displayTheme);
    clusters.push({
      theme,
      displayTheme,
      connections: list,
      countryCodes: [...countries],
    });
  }
  clusters.sort((a, b) => b.connections.length - a.connections.length);
  return clusters;
}

/** Fallback cluster from loose ripples when themed grouping finds none (local device history). */
export function synthesizeRipplefireCluster(
  connections: AtlasConnection[],
): AtlasThemeCluster | null {
  const ripples = connections.filter((c) => c.kind === "ripple");
  if (ripples.length === 0) return null;
  const countries = new Set<string>();
  for (const c of ripples) {
    countries.add(c.from);
    countries.add(c.to);
  }
  const displayTheme = pickDisplayTheme(ripples);
  return {
    theme: clusterSeedKey(ripples, displayTheme),
    displayTheme,
    connections: ripples,
    countryCodes: [...countries],
  };
}

export function synthesizeWavefireCluster(
  connections: AtlasConnection[],
): AtlasThemeCluster | null {
  const waves = connections.filter((c) => c.kind === "wave");
  if (waves.length === 0) return null;
  const countries = new Set<string>();
  for (const c of waves) {
    countries.add(c.from);
    countries.add(c.to);
  }
  const displayTheme = pickDisplayTheme(waves);
  return {
    theme: clusterSeedKey(waves, displayTheme),
    displayTheme,
    connections: waves,
    countryCodes: [...countries],
  };
}

/** Largest cluster only — convenience for callers that need a single result. */
export function detectAtlasThemeCluster(
  connections: AtlasConnection[],
  windowMs: number,
  minEvents: number,
  minCountries: number,
  kind: AtlasConnection["kind"],
): AtlasThemeCluster | null {
  return (
    detectAtlasThemeClusters(
      connections,
      windowMs,
      minEvents,
      minCountries,
      kind,
    )[0] ?? null
  );
}

/** Wavefire — mutual **waves** only (both people rippled back). */
export function detectWavefireClusters(
  connections: AtlasConnection[],
  windowMs: number,
  minEvents: number,
  minCountries: number,
): AtlasThemeCluster[] {
  return detectAtlasThemeClusters(
    connections,
    windowMs,
    minEvents,
    minCountries,
    "wave",
  );
}

export function detectWavefireCluster(
  connections: AtlasConnection[],
  windowMs: number,
  minEvents: number,
  minCountries: number,
): AtlasThemeCluster | null {
  return detectWavefireClusters(
    connections,
    windowMs,
    minEvents,
    minCountries,
  )[0] ?? null;
}

/** Ripplefire — one-way **ripples** grouped by daily-challenge theme id. */
export function detectRipplefireClusters(
  connections: AtlasConnection[],
  windowMs: number,
  minEvents: number,
  minCountries: number,
): AtlasThemeCluster[] {
  return detectThemeAnchoredRippleClusters(
    connections,
    windowMs,
    minEvents,
    minCountries,
  );
}

export function detectRipplefireCluster(
  connections: AtlasConnection[],
  windowMs: number,
  minEvents: number,
  minCountries: number,
): AtlasThemeCluster | null {
  return detectRipplefireClusters(
    connections,
    windowMs,
    minEvents,
    minCountries,
  )[0] ?? null;
}

/** Active arcs of one kind within the Ripplefire / Wavefire time window. */
export function connectionsInFireWindow(
  connections: AtlasConnection[],
  windowMs: number,
  kind: AtlasConnection["kind"],
): AtlasConnection[] {
  const now = Date.now();
  return connections.filter((c) => {
    if (c.kind !== kind) return false;
    const t = Date.parse(c.createdAt);
    return Number.isFinite(t) && now - t <= windowMs;
  });
}
