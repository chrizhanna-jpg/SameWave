import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Candidate, Wave } from "./types";

const TOGGLE_KEY = "samewave.testPhotos.enabled";

/**
 * Build-time gate. Expo inlines `EXPO_PUBLIC_*` at bundle time.
 * When the flag is not exactly `"1"`, the require of the asset catalog is
 * unreachable and Metro omits the JPEG modules from the export.
 */
export function testPhotosBuildEnabled(): boolean {
  return process.env.EXPO_PUBLIC_TEST_PHOTOS === "1";
}

/** Candidates from bundled test JPEGs — empty array when the build flag is off. */
export function loadTestPhotoCandidates(): Candidate[] {
  if (process.env.EXPO_PUBLIC_TEST_PHOTOS !== "1") {
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const catalog = require("../assets/test-photos/catalog") as {
    getTestPhotoCandidates: () => Candidate[];
  };
  return catalog.getTestPhotoCandidates();
}

/** Synthetic Waves for the keepsake map — empty when the build flag is off. */
export function loadSampleWaves(): Wave[] {
  if (process.env.EXPO_PUBLIC_TEST_PHOTOS !== "1") {
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const catalog = require("../assets/test-photos/catalog") as {
    getSampleWaves: () => Wave[];
  };
  return catalog.getSampleWaves();
}

/**
 * Topic-matched samples first, then the rest — never an empty deck when any
 * samples exist. Pure helper so unit tests never pull React Native via the
 * asset catalog.
 */
export function preferTopicSamples<T extends { theme?: string | null }>(
  all: readonly T[],
  preferTopic?: string | null,
): T[] {
  const topic = preferTopic?.trim() || null;
  if (!topic) return [...all];
  const matched = all.filter((c) => c.theme === topic);
  const rest = all.filter((c) => c.theme !== topic);
  // Always keep every sample; topic matches lead so Coffee opens on coffee.
  return matched.length > 0 ? [...matched, ...rest] : [...all];
}

/**
 * Merge live ranked candidates with optional local test samples.
 * Samples append when the build includes them AND the user toggle is on.
 * Topic-matched samples lead; other samples always follow (never zero when on).
 */
export function withOptionalTestPhotos(
  live: readonly Candidate[],
  opts: {
    useSamplePhotos: boolean;
    excludeIds?: readonly string[];
    preferTopic?: string | null;
  },
): Candidate[] {
  if (!testPhotosBuildEnabled() || !opts.useSamplePhotos) {
    return [...live];
  }
  const excluded = new Set(opts.excludeIds ?? []);
  const all = loadTestPhotoCandidates().filter((c) => !excluded.has(c.id) && Boolean(c.uri));
  const samples = preferTopicSamples(all, opts.preferTopic);
  const liveIds = new Set(live.map((c) => c.id));
  return [...samples.filter((c) => !liveIds.has(c.id)), ...live];
}

export function withOptionalSampleWaves(
  live: readonly Wave[],
  opts: { useSamplePhotos: boolean },
): Wave[] {
  if (!testPhotosBuildEnabled() || !opts.useSamplePhotos) {
    return [...live];
  }
  const samples = loadSampleWaves();
  const liveIds = new Set(live.map((w) => w.id));
  return [...live, ...samples.filter((w) => !liveIds.has(w.id))];
}

/** In-memory mirror so Match can react without remount / re-send. */
let cachedToggle: boolean | null = null;
const toggleListeners = new Set<(on: boolean) => void>();

/** Last known toggle (null until first read/write this session). */
export function peekSamplePhotosToggle(): boolean | null {
  return cachedToggle;
}

export function subscribeSamplePhotosToggle(listener: (on: boolean) => void): () => void {
  toggleListeners.add(listener);
  return () => {
    toggleListeners.delete(listener);
  };
}

function publishToggle(on: boolean): void {
  cachedToggle = on;
  for (const listener of toggleListeners) listener(on);
}

export async function readSamplePhotosToggle(): Promise<boolean> {
  if (!testPhotosBuildEnabled()) return false;
  try {
    const raw = await AsyncStorage.getItem(TOGGLE_KEY);
    // First launch in a sample-enabled preview: default ON so Match never
    // opens empty after Metro/ngrok restarts with EXPO_PUBLIC_TEST_PHOTOS=1.
    if (raw === null) {
      publishToggle(true);
      await AsyncStorage.setItem(TOGGLE_KEY, "1");
      return true;
    }
    const on = raw === "1";
    cachedToggle = on;
    return on;
  } catch {
    return cachedToggle !== false;
  }
}

export async function writeSamplePhotosToggle(on: boolean): Promise<void> {
  if (!testPhotosBuildEnabled()) return;
  publishToggle(on);
  try {
    await AsyncStorage.setItem(TOGGLE_KEY, on ? "1" : "0");
  } catch {
    /* */
  }
}
