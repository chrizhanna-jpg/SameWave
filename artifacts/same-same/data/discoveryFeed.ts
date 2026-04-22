// Synthetic global "right now" feed of matches happening around the
// world. Until we have a real backend feed, this generates a deterministic
// rolling list that refreshes every few minutes so the Discover tab feels
// alive without being random on every render.

import { SAMPLE_PHOTOS, type SamplePhoto, DAILY_CHALLENGES } from "./samplePhotos";
import { getGeoTier, getTimeTier, type GeoTier, type TimeTier } from "@/utils/celebrations";
import { sampleMatchStats, type SampleMatchStats } from "@/utils/sampleStats";
import { photoKey } from "@/utils/photoKey";

export interface DiscoveryItem {
  id: string;
  a: SamplePhoto;
  b: SamplePhoto;
  theme: string;
  themeEmoji: string;
  themeTitle: string;
  /** Minutes ago that the *match* (B's reaction to A) happened. */
  happenedMinutesAgo: number;
  geoTier: GeoTier;
  timeTier: TimeTier;
  /** True if both posted in the same minute — the rarest celebration. */
  sameMinute: boolean;
  /** How many other people also said "same same" to this match. */
  echoStats: SampleMatchStats;
}

// Buckets photos by theme so we can pair "morning" with "morning" etc.
function byTheme(): Record<string, SamplePhoto[]> {
  const out: Record<string, SamplePhoto[]> = {};
  for (const p of SAMPLE_PHOTOS) {
    if (!out[p.theme]) out[p.theme] = [];
    out[p.theme].push(p);
  }
  return out;
}

// Pure deterministic hash → 0..1 — no Math.random so a refresh shows the
// same feed within the same time window.
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function pick<T>(arr: T[], seed: string): T {
  return arr[Math.floor(hash(seed) * arr.length)];
}

// We want a mix of celebration intensities — emphasise "same minute" and
// "same hour" because that's what makes the feed feel buzzing right now.
const TIME_PROFILES: { weight: number; minDiff: number; maxDiff: number }[] = [
  { weight: 5, minDiff: 0, maxDiff: 0.9 },     // same minute
  { weight: 8, minDiff: 1, maxDiff: 55 },      // same hour
  { weight: 4, minDiff: 60, maxDiff: 60 * 23 }, // same day
  { weight: 2, minDiff: 60 * 24, maxDiff: 60 * 24 * 6 }, // same week
];

function pickTimeProfile(seed: string) {
  const total = TIME_PROFILES.reduce((s, p) => s + p.weight, 0);
  let r = hash(seed) * total;
  for (const p of TIME_PROFILES) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return TIME_PROFILES[TIME_PROFILES.length - 1];
}

/**
 * Build a discovery feed of N items. The feed is deterministic per
 * `windowKey` (defaults to current 5-minute window) so the user sees the
 * same items if they navigate away and back, but it rotates over time.
 */
export function buildDiscoveryFeed(
  count = 14,
  windowKey?: string,
  excludeKeys?: Set<string>,
): DiscoveryItem[] {
  const exclude = excludeKeys ?? new Set<string>();
  const filterPool = (pool: SamplePhoto[]) =>
    exclude.size === 0 ? pool : pool.filter((p) => !exclude.has(photoKey(p.uri)));
  const themesAll = byTheme();
  const themes: Record<string, SamplePhoto[]> = {};
  for (const t of Object.keys(themesAll)) {
    themes[t] = filterPool(themesAll[t]);
  }
  const themeIds = Object.keys(themes).filter((t) => themes[t].length >= 2);
  if (themeIds.length === 0) return [];

  // 5-minute rolling window so the feed rotates naturally without the
  // user noticing churn while they scroll.
  const now = Date.now();
  const window = windowKey ?? Math.floor(now / (5 * 60_000)).toString();

  const items: DiscoveryItem[] = [];
  const seenPairs = new Set<string>();

  let attempts = 0;
  while (items.length < count && attempts < count * 6) {
    attempts++;
    const seed = `${window}:${attempts}`;
    const themeId = pick(themeIds, seed + ":t");
    const pool = themes[themeId];
    if (pool.length < 2) continue;

    const a = pick(pool, seed + ":a");
    let b = pick(pool, seed + ":b");
    // Ensure two different countries — the whole point of a match is
    // strangers on opposite sides of the world.
    let guard = 0;
    while (b.countryCode === a.countryCode && guard < 6) {
      b = pool[(pool.indexOf(b) + 1) % pool.length];
      guard++;
    }
    if (b.countryCode === a.countryCode) continue;

    const pairKey = [a.id, b.id].sort().join("-");
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const profile = pickTimeProfile(seed + ":time");
    // Pick a recent "happened" timestamp — closer = feels more live.
    const happenedMinutesAgo = Math.floor(
      hash(seed + ":hap") * 90 + 1,
    );
    // Time-tier is computed from the gap between the two posts; profile
    // controls how close they were.
    const diff = profile.minDiff + hash(seed + ":d") * (profile.maxDiff - profile.minDiff);
    const aPostedMin = happenedMinutesAgo + diff / 2;
    const bPostedMin = happenedMinutesAgo - diff / 2;
    const aPostedAt = new Date(now - aPostedMin * 60_000).toISOString();
    const timeTier = getTimeTier(aPostedAt, Math.max(0, bPostedMin));
    const geoTier = getGeoTier(a.countryCode, b.countryCode);

    const challenge = DAILY_CHALLENGES.find((c) => c.id === themeId);

    items.push({
      id: `disc:${window}:${a.id}-${b.id}`,
      a,
      b,
      theme: themeId,
      themeEmoji: challenge?.emoji ?? "✨",
      themeTitle: challenge?.title ?? themeId,
      happenedMinutesAgo,
      geoTier,
      timeTier,
      sameMinute: timeTier.kind === "minute",
      // Stable per (a,b) pair so the count doesn't churn between renders.
      echoStats: sampleMatchStats(`${a.id}|${b.id}`),
    });
  }

  // Sort by recency + celebration weight so the most "alive" items rise.
  items.sort((x, y) => {
    const wx = x.timeTier.rank * 10 + x.geoTier.rank - x.happenedMinutesAgo / 60;
    const wy = y.timeTier.rank * 10 + y.geoTier.rank - y.happenedMinutesAgo / 60;
    return wy - wx;
  });
  return items;
}
