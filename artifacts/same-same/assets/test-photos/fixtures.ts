/**
 * Dev-only location/time metadata for sample Match + Waves-map fixtures.
 * No real people/places — synthetic coords. Required only when
 * EXPO_PUBLIC_TEST_PHOTOS=1 so production exports omit this module.
 */
import { matchBonuses, type MatchBonuses } from "@/core/bonuses";
import type { Wave } from "@/core/types";

import { SAMPLE_WAVE_ID_PREFIX } from "./sampleIds";

export type TestPhotoMeta = {
  id: string;
  file: string;
  /** Fake capture time with explicit offset (ISO 8601). */
  takenAt: string;
  countryCode: string;
  continent: string;
  lat: number;
  lng: number;
};

/**
 * Eight samples with varied times/places so pairing can hit every bonus case
 * plus a no-match pair.
 *
 * Anchor: 2026-06-15T12:00:00+01:00 in London.
 */
export const TEST_PHOTO_META: readonly TestPhotoMeta[] = [
  {
    id: "test_sample_01",
    file: "01-mountain-lake.jpg",
    takenAt: "2026-06-15T12:00:00+01:00", // London noon
    countryCode: "GB",
    continent: "europe",
    lat: 51.5074,
    lng: -0.1278,
  },
  {
    id: "test_sample_02",
    file: "02-coffee-hands.jpg",
    takenAt: "2026-06-15T12:00:45+01:00", // same minute
    countryCode: "GB",
    continent: "europe",
    lat: 51.515,
    lng: -0.12,
  },
  {
    id: "test_sample_03",
    file: "03-forest-path.jpg",
    takenAt: "2026-06-15T12:35:00+01:00", // same hour
    countryCode: "FR",
    continent: "europe",
    lat: 48.8566,
    lng: 2.3522,
  },
  {
    id: "test_sample_04",
    file: "04-sunlit-hills.jpg",
    takenAt: "2026-06-15T18:00:00+01:00", // same day
    countryCode: "DE",
    continent: "europe",
    lat: 52.52,
    lng: 13.405,
  },
  {
    id: "test_sample_05",
    file: "05-foggy-hills.jpg",
    takenAt: "2026-06-17T10:00:00+01:00", // same week
    countryCode: "IT",
    continent: "europe",
    lat: 41.9028,
    lng: 12.4964,
  },
  {
    id: "test_sample_06",
    file: "06-starry-mountain.jpg",
    takenAt: "2026-06-28T09:00:00+01:00", // same month
    countryCode: "ES",
    continent: "europe",
    lat: 40.4168,
    lng: -3.7038,
  },
  {
    id: "test_sample_07",
    file: "07-beach.jpg",
    takenAt: "2026-06-15T12:00:00-04:00", // same clock-ish, US (same country pair with 08 uses JP vs BR = no match)
    countryCode: "US",
    continent: "americas",
    lat: 40.7128,
    lng: -74.006,
  },
  {
    id: "test_sample_08",
    file: "08-ocean-wave.jpg",
    takenAt: "2026-09-01T08:00:00+09:00", // far in time + JP — no match vs US
    countryCode: "JP",
    continent: "asia",
    lat: 35.6762,
    lng: 139.6503,
  },
] as const;

export type FixtureCaseId =
  | "same_minute"
  | "same_hour"
  | "same_day"
  | "same_week"
  | "same_month"
  | "same_country"
  | "same_continent"
  | "no_match";

export type FixturePair = {
  caseId: FixtureCaseId;
  /** Index into TEST_PHOTO_META (mine). */
  mine: number;
  /** Index into TEST_PHOTO_META (theirs). */
  theirs: number;
  /** Expected strongest time/place for the assertion. */
  expect: {
    strongestTime: MatchBonuses["strongestTime"];
    strongestPlace: MatchBonuses["strongestPlace"];
    headline: string | null;
  };
};

/** Pairs that exercise every requested case (mine is always index 0 where useful). */
export const FIXTURE_PAIRS: readonly FixturePair[] = [
  {
    caseId: "same_minute",
    mine: 0,
    theirs: 1,
    expect: { strongestTime: "hour", strongestPlace: "country", headline: "Same hour, same country" },
  },
  {
    caseId: "same_hour",
    mine: 0,
    theirs: 2,
    expect: { strongestTime: "hour", strongestPlace: "continent", headline: "Same hour, same continent" },
  },
  {
    caseId: "same_day",
    mine: 0,
    theirs: 3,
    expect: { strongestTime: "day", strongestPlace: "continent", headline: "Same day, same continent" },
  },
  {
    caseId: "same_week",
    mine: 0,
    theirs: 4,
    expect: { strongestTime: "week", strongestPlace: "continent", headline: "Same week, same continent" },
  },
  {
    caseId: "same_month",
    mine: 0,
    theirs: 5,
    expect: { strongestTime: "month", strongestPlace: "continent", headline: "Same month, same continent" },
  },
  {
    caseId: "same_country",
    mine: 0,
    theirs: 1,
    // same_minute pair also hits same_country — assert place includes country
    expect: { strongestTime: "hour", strongestPlace: "country", headline: "Same hour, same country" },
  },
  {
    caseId: "same_continent",
    mine: 0,
    theirs: 3,
    expect: { strongestTime: "day", strongestPlace: "continent", headline: "Same day, same continent" },
  },
  {
    caseId: "no_match",
    mine: 6,
    theirs: 7,
    expect: { strongestTime: null, strongestPlace: null, headline: null },
  },
];

export function momentFor(meta: TestPhotoMeta) {
  return { takenAt: meta.takenAt, countryCode: meta.countryCode };
}

export function bonusesForPair(pair: FixturePair): MatchBonuses {
  const mine = TEST_PHOTO_META[pair.mine]!;
  const theirs = TEST_PHOTO_META[pair.theirs]!;
  return matchBonuses(momentFor(mine), momentFor(theirs));
}

/** Synthetic Waves for the keepsake map when sample photos are enabled. */
export function sampleWavesForMap(): Wave[] {
  // One wave per unique case (skip duplicate same_country / same_continent entries).
  const seen = new Set<string>();
  const out: Wave[] = [];
  for (const pair of FIXTURE_PAIRS) {
    if (pair.caseId === "same_country" || pair.caseId === "same_continent") continue;
    const key = `${pair.mine}-${pair.theirs}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mine = TEST_PHOTO_META[pair.mine]!;
    const theirs = TEST_PHOTO_META[pair.theirs]!;
    out.push({
      id: `${SAMPLE_WAVE_ID_PREFIX}${pair.caseId}`,
      formedAt: mine.takenAt,
      mine: {
        photoId: mine.id,
        uri: null, // filled by catalog when loading for UI
        countryCode: mine.countryCode,
        takenAt: mine.takenAt,
        lat: mine.lat,
        lng: mine.lng,
      },
      theirs: {
        photoId: theirs.id,
        uri: null,
        countryCode: theirs.countryCode,
        takenAt: theirs.takenAt,
        lat: theirs.lat,
        lng: theirs.lng,
      },
    });
  }
  return out;
}

/** Lon/lat for map projection when country centroids are too coarse. */
export function sampleWaveEndpoints(waveId: string): {
  mine: { lng: number; lat: number };
  theirs: { lng: number; lat: number };
} | null {
  const pair = FIXTURE_PAIRS.find((p) => `${SAMPLE_WAVE_ID_PREFIX}${p.caseId}` === waveId);
  if (!pair) return null;
  const mine = TEST_PHOTO_META[pair.mine]!;
  const theirs = TEST_PHOTO_META[pair.theirs]!;
  return {
    mine: { lng: mine.lng, lat: mine.lat },
    theirs: { lng: theirs.lng, lat: theirs.lat },
  };
}
