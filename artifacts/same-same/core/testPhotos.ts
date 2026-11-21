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
 * Merge live ranked candidates with optional local test samples.
 * Samples are only appended when the build includes them AND the user toggle is on.
 */
export function withOptionalTestPhotos(
  live: readonly Candidate[],
  opts: { useSamplePhotos: boolean; excludeIds?: readonly string[] },
): Candidate[] {
  if (!testPhotosBuildEnabled() || !opts.useSamplePhotos) {
    return [...live];
  }
  const excluded = new Set(opts.excludeIds ?? []);
  const samples = loadTestPhotoCandidates().filter((c) => !excluded.has(c.id) && Boolean(c.uri));
  const liveIds = new Set(live.map((c) => c.id));
  return [...live, ...samples.filter((c) => !liveIds.has(c.id))];
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

export async function readSamplePhotosToggle(): Promise<boolean> {
  if (!testPhotosBuildEnabled()) return false;
  try {
    return (await AsyncStorage.getItem(TOGGLE_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function writeSamplePhotosToggle(on: boolean): Promise<void> {
  if (!testPhotosBuildEnabled()) return;
  try {
    await AsyncStorage.setItem(TOGGLE_KEY, on ? "1" : "0");
  } catch {
    /* */
  }
}
