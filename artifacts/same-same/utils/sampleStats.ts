// Deterministic "echo count" generator for sample / curated photos that
// have no real vote history yet. We hash the photo's stable URI so the
// same image always yields the same numbers — users see consistent stats
// across sessions and inside the discovery feed, and the launch
// experience still carries the "X others matched on this" social signal
// even before there's a critical mass of real users.
//
// Once a photo has real votes, the backend's /match-stats endpoint
// returns the live numbers and these are no longer used for it.

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface SampleMatchStats {
  sameLastHour: number;
  sameLastDay: number;
  sameAllTime: number;
}

// Bucketed so most photos look modestly popular and a few feel like
// breakout matches — mirrors how a real social graph distributes.
export function sampleMatchStats(seed: string): SampleMatchStats {
  const h = hash(seed);
  // Most photos: low activity. Some popular ones (~15%) get a boost.
  const tier = h % 100;
  let allTime: number;
  if (tier < 60) {
    allTime = 2 + (h % 14); // 2–15
  } else if (tier < 90) {
    allTime = 16 + ((h >> 4) % 60); // 16–75
  } else {
    allTime = 80 + ((h >> 8) % 240); // 80–319 (rare viral)
  }
  // Day count is roughly 35–70% of all-time; hour is a sliver of that.
  const dayPct = 0.35 + ((h >> 12) % 36) / 100;
  const hourPct = 0.05 + ((h >> 16) % 18) / 100;
  const day = Math.max(1, Math.round(allTime * dayPct));
  const hour = Math.max(0, Math.round(day * hourPct));
  return {
    sameAllTime: allTime,
    sameLastDay: day,
    sameLastHour: hour,
  };
}
