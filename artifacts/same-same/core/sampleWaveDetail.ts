/**
 * Feeling / clip metadata for preview sample Waves (TEST_PHOTOS builds).
 */
import type { WaveDetail } from "../backend/types";
import type { Wave } from "./types";

export function sampleWaveDetail(wave: Wave): WaveDetail {
  if (process.env.EXPO_PUBLIC_TEST_PHOTOS !== "1") {
    return {
      mine: { vibe: null, recordingUri: null, emotion: null, topic: null },
      theirs: { vibe: null, recordingUri: null, emotion: null, topic: null },
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TEST_PHOTO_META } = require("../assets/test-photos/fixtures") as {
    TEST_PHOTO_META: readonly { id: string; theme: string; emotion: string }[];
  };
  const mine = TEST_PHOTO_META.find((m) => m.id === wave.mine.photoId);
  const theirs = TEST_PHOTO_META.find((m) => m.id === wave.theirs.photoId);
  return {
    mine: {
      vibe: mine?.emotion ?? null,
      recordingUri: null,
      emotion: mine?.emotion ?? null,
      topic: mine?.theme ?? null,
    },
    theirs: {
      vibe: theirs?.emotion ?? null,
      recordingUri: null,
      emotion: theirs?.emotion ?? null,
      topic: theirs?.theme ?? null,
    },
  };
}
