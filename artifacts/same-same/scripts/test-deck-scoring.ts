/**
 * Deck scoring: results stay identical when scores are reused, reuse is keyed
 * by the requester's context, and a swipe-sized re-rank is cheap.
 * Run from artifacts/same-same: tsx scripts/test-deck-scoring.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require("node:module");

(globalThis as { __DEV__?: boolean }).__DEV__ = false;
const stubs: Record<string, unknown> = {
  "react-native": {
    Platform: { OS: "android", select: (o: Record<string, unknown>) => o.android },
    Dimensions: { get: () => ({ width: 400, height: 800 }) },
    NativeModules: {},
    StyleSheet: { create: (x: unknown) => x },
  },
  "expo-constants": { default: { expoConfig: {}, manifest: null }, __esModule: true },
};
const originalLoad = Module._load;
Module._load = function (request: string, ...rest: unknown[]) {
  if (request in stubs) return stubs[request];
  return originalLoad.call(this, request, ...rest);
};

const { scoreCandidates } = require("../utils/deckScoring") as typeof import("../utils/deckScoring");
const { SAMPLE_PHOTOS } = require("../data/samplePhotos") as typeof import("../data/samplePhotos");

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok || !detail ? "" : ` (${detail})`}`);
  if (!ok) process.exitCode = 1;
}

const noExclusions = new Set<string>();
const first = scoreCandidates("my day", ["warm"], noExclusions, [], false, [], ["cup"]);
const again = scoreCandidates("my day", ["warm"], noExclusions, [], false, [], ["cup"]);

assert("the pool is ranked", first.length > 20, String(first.length));
assert(
  "reusing scores returns the same ranking",
  first.length === again.length &&
    first.every((c, i) => c.photo === again[i].photo && c.score === again[i].score),
);
assert(
  "ranking is sorted high to low",
  first.every((c, i) => i === 0 || first[i - 1].score >= c.score),
);

const otherTags = scoreCandidates("my day", ["night"], noExclusions, [], false, [], ["cup"]);
const sampleWithWarm = SAMPLE_PHOTOS.find((p) => p.tags.includes("warm"));
const sampleWithNight = SAMPLE_PHOTOS.find((p) => p.tags.includes("night"));
if (sampleWithWarm && sampleWithNight) {
  const warmBefore = first.find((c) => c.photo === sampleWithWarm);
  const warmAfter = otherTags.find((c) => c.photo === sampleWithWarm);
  const nightBefore = first.find((c) => c.photo === sampleWithNight);
  const nightAfter = otherTags.find((c) => c.photo === sampleWithNight);
  assert(
    "a different requester context is scored afresh",
    !!warmBefore && !!warmAfter && !!nightBefore && !!nightAfter &&
      warmAfter.sharedTags.includes("warm") === false &&
      warmBefore.sharedTags.includes("warm") === true &&
      nightAfter.sharedTags.includes("night") === true &&
      nightBefore.sharedTags.includes("night") === false,
  );
}

const skip = new Set<string>();
const top = first[0];
const topKey = (top.photo.uri.match(/photo-[A-Za-z0-9_-]+/) ?? [])[0] ?? "";
skip.add(topKey);
const afterExclusion = scoreCandidates("my day", ["warm"], skip, [], false, [], ["cup"]);
assert(
  "exclusions still apply on reused scores",
  topKey !== "" && afterExclusion.every((c) => c.photo !== top.photo),
);

const t0 = Date.now();
for (let i = 0; i < 50; i++) {
  scoreCandidates("my day", ["warm"], noExclusions, [], false, [], ["cup"]);
}
const perCall = (Date.now() - t0) / 50;
assert("a swipe-sized re-rank is cheap", perCall < 5, `${perCall.toFixed(2)}ms`);

console.log("Done. exitCode=", process.exitCode ?? 0);
