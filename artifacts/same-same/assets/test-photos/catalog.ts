/**
 * Dev-only Match sample photos. Required only when
 * `EXPO_PUBLIC_TEST_PHOTOS === "1"` so Metro dead-code-eliminates JPEGs +
 * fixtures from production / preview-APK exports.
 */
import { Image } from "react-native";

import type { Candidate } from "@/core/types";
import type { Wave } from "@/core/types";

import { FIXTURE_PAIRS, TEST_PHOTO_META, sampleWavesForMap } from "./fixtures";

const MODULES: Record<string, number> = {
  "01-mountain-lake.jpg": require("./01-mountain-lake.jpg"),
  "02-coffee-hands.jpg": require("./02-coffee-hands.jpg"),
  "03-forest-path.jpg": require("./03-forest-path.jpg"),
  "04-sunlit-hills.jpg": require("./04-sunlit-hills.jpg"),
  "05-foggy-hills.jpg": require("./05-foggy-hills.jpg"),
  "06-starry-mountain.jpg": require("./06-starry-mountain.jpg"),
  "07-beach.jpg": require("./07-beach.jpg"),
  "08-ocean-wave.jpg": require("./08-ocean-wave.jpg"),
};

function uriForFile(file: string): string {
  const mod = MODULES[file];
  if (mod == null) return "";
  return Image.resolveAssetSource(mod)?.uri ?? "";
}

/** Ids use a `test_sample_` prefix so stock filters never treat them as CDN stock. */
export function getTestPhotoCandidates(): Candidate[] {
  return TEST_PHOTO_META.map((meta, index) => {
    const uri = uriForFile(meta.file);
    return {
      id: meta.id,
      score: 10 - index * 0.1,
      uri,
      createdAt: meta.takenAt,
      theme: null,
      emotion: null,
      takenAt: meta.takenAt,
      countryCode: meta.countryCode,
    } satisfies Candidate;
  }).filter((c) => Boolean(c.uri));
}

export function getSampleWaves(): Wave[] {
  return sampleWavesForMap().map((wave) => {
    const mineMeta = TEST_PHOTO_META.find((m) => m.id === wave.mine.photoId);
    const theirsMeta = TEST_PHOTO_META.find((m) => m.id === wave.theirs.photoId);
    return {
      ...wave,
      mine: {
        ...wave.mine,
        uri: mineMeta ? uriForFile(mineMeta.file) : null,
      },
      theirs: {
        ...wave.theirs,
        uri: theirsMeta ? uriForFile(theirsMeta.file) : null,
      },
    };
  });
}

export { FIXTURE_PAIRS, TEST_PHOTO_META };
