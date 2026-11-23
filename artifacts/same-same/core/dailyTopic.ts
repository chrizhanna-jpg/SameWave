/**
 * Everyone sees the same Daily topic each calendar day (UTC), chosen from
 * data/topics.ts without a server. Topics that make a weak daily prompt
 * are left out of the rotation.
 */
import { TOPICS, topicFor, type Topic } from "../data/topics";

/**
 * Fine as free picks, awkward as "Today: …" prompts — skip these in the
 * daily rotation only. The full Topic list is unchanged.
 */
const SKIP_DAILY_IDS = new Set([
  "selfie",
  "objects",
  "furniture",
  "smallthing",
  "door",
  "ritual",
  "chores",
  "listening",
  "wearing",
]);

/** Topics that work as a calm daily prompt. */
export function dailyTopicPool(topics: readonly Topic[] = TOPICS): Topic[] {
  return topics.filter((t) => !SKIP_DAILY_IDS.has(t.id));
}

/** UTC calendar day as YYYY-MM-DD. */
export function utcDateKey(at: Date | number = Date.now()): string {
  const d = typeof at === "number" ? new Date(at) : at;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Whole UTC days since the Unix epoch. */
export function utcDayIndex(at: Date | number = Date.now()): number {
  const d = typeof at === "number" ? new Date(at) : at;
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
}

/**
 * Today's Daily topic for everyone. Stable for a given UTC date; walks the
 * suitable pool in order so consecutive days feel different.
 */
export function dailyTopicFor(at: Date | number = Date.now()): Topic {
  const pool = dailyTopicPool();
  if (pool.length === 0) {
    const fallback = TOPICS[0];
    if (!fallback) throw new Error("No Topics available for the Daily topic");
    return fallback;
  }
  return pool[utcDayIndex(at) % pool.length]!;
}

export function isSameUtcDay(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return utcDateKey(left) === utcDateKey(right);
}

/** Whether this Topic id is today's Daily topic. */
export function isTodaysDailyTopic(topicId: string | null | undefined, at: Date | number = Date.now()): boolean {
  if (!topicId) return false;
  return dailyTopicFor(at).id === topicId && !!topicFor(topicId);
}
