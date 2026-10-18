/**
 * Map lines and wave-reveal timing.
 * Run: node --experimental-strip-types scripts/test-map-waves.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { geoEqualEarth } from "d3-geo";

import { atlasArcPathD, atlasArcSegment } from "../utils/atlasArcPath";
import {
  LAUNCH_WAVE_TARGET,
  MAP_MINE_WAVE_COLOR,
  MAP_OTHER_WAVE_COLOR,
  fillWorldWaveFeed,
  isLaunchWaveId,
  prepareMapWaves,
  type LaunchPhoto,
  type MapWaveInput,
} from "../utils/mapWaves";
import {
  WAVE_REVEAL_MAX_MS,
  WAVE_REVEAL_MS,
  waveRevealLifetimeMs,
} from "../utils/waveReveal";

const photos: LaunchPhoto[] = [
  { id: "a", uri: "https://img.example/a", country: "Japan", countryCode: "JP", countryFlag: "🇯🇵", theme: "morning" },
  { id: "b", uri: "https://img.example/b", country: "Brazil", countryCode: "BR", countryFlag: "🇧🇷", theme: "morning" },
  { id: "c", uri: "https://img.example/c", country: "Kenya", countryCode: "KE", countryFlag: "🇰🇪", theme: "food" },
  { id: "d", uri: "https://img.example/d", country: "France", countryCode: "FR", countryFlag: "🇫🇷", theme: "food" },
  { id: "e", uri: "https://img.example/e", country: "Canada", countryCode: "CA", countryFlag: "🇨🇦", theme: "street" },
  { id: "f", uri: "https://img.example/f", country: "India", countryCode: "IN", countryFlag: "🇮🇳", theme: "street" },
  { id: "g", uri: "https://img.example/g", country: "Mexico", countryCode: "MX", countryFlag: "🇲🇽", theme: "night" },
  { id: "h", uri: "https://img.example/h", country: "Egypt", countryCode: "EG", countryFlag: "🇪🇬", theme: "night" },
  { id: "i", uri: "https://img.example/i", country: "Japan", countryCode: "jp", countryFlag: "🇯🇵", theme: "morning" },
];

const ripple: MapWaveInput = {
  id: "ripple-1",
  kind: "ripple",
  from: "US",
  to: "DE",
  createdAt: "2024-01-01T00:00:00.000Z",
  theme: "x",
};

const otherWave: MapWaveInput = {
  id: "wave-public",
  kind: "wave",
  from: "us",
  to: "de",
  createdAt: "2024-02-01T00:00:00.000Z",
  theme: "coffee",
  mine: false,
};

const mineWave: MapWaveInput = {
  id: "wave-mine",
  kind: "wave",
  from: "DE",
  to: "US",
  createdAt: "2024-03-01T00:00:00.000Z",
  theme: "coffee",
  mine: true,
};

const filled = prepareMapWaves([ripple, otherWave], [], photos);
assert.equal(filled.some((wave) => wave.kind !== "wave"), false);
assert.equal(filled.some((wave) => wave.id === "ripple-1"), false);
assert.equal(filled.length, LAUNCH_WAVE_TARGET);
const publicWave = filled.find((wave) => wave.id === "wave-public");
if (!publicWave) throw new Error("expected the public wave");
assert.equal(publicWave.color, MAP_OTHER_WAVE_COLOR);
assert.equal(publicWave.mine, undefined);
assert.ok(filled.some((wave) => isLaunchWaveId(wave.id)));
assert.ok(filled.every((wave) => wave.from !== wave.to));

const withMine = prepareMapWaves([otherWave, mineWave], [], photos, 1);
assert.equal(withMine.length, 1);
assert.equal(withMine[0]?.mine, true);
assert.equal(withMine[0]?.color, MAP_MINE_WAVE_COLOR);
assert.equal(withMine[0]?.id, "wave-mine");

const viewerOnly = prepareMapWaves(
  [],
  [{ id: "echo-1", from: "JP", to: "BR", createdAt: "2024-04-01T00:00:00.000Z", theme: "morning" }],
  photos,
  2,
);
const viewerLine = viewerOnly.find((wave) => wave.mine);
if (!viewerLine) throw new Error("expected the viewer wave");
assert.equal(viewerLine.color, MAP_MINE_WAVE_COLOR);
assert.equal(viewerLine.from !== viewerLine.to, true);
assert.equal(viewerOnly.filter((wave) => wave.mine).length, 1);

const realWaves: MapWaveInput[] = "CDEFGHIJ".split("").map((letter, index) => ({
  id: `real-${index}`,
  kind: "wave",
  from: "US",
  to: `${letter}A`,
  createdAt: "2024-01-01T00:00:00.000Z",
}));
// "CA" collides with a real country but that's fine — codes just need to be 2 letters.
const enough = prepareMapWaves(realWaves, [], photos);
assert.equal(enough.length, 8);
assert.equal(enough.some((wave) => isLaunchWaveId(wave.id)), false);

const feed = fillWorldWaveFeed([], photos, 3);
assert.equal(feed.length, 3);
assert.ok(feed.every((wave) => isLaunchWaveId(wave.echoId)));
assert.equal(feed[0]?.a.countryCode === feed[0]?.b.countryCode, false);

const kept = fillWorldWaveFeed(
  [
    {
      echoId: "real-echo",
      theme: "morning",
      mutualAt: null,
      a: {
        id: "p1",
        uri: "https://img.example/p1",
        countryCode: "JP",
        captureCountryCode: "JP",
        capturedAt: null,
        createdAt: null,
        country: "Japan",
        countryFlag: "🇯🇵",
        customAudioUrl: null,
      },
      b: {
        id: "p2",
        uri: "https://img.example/p2",
        countryCode: "BR",
        captureCountryCode: "BR",
        capturedAt: null,
        createdAt: null,
        country: "Brazil",
        countryFlag: "🇧🇷",
        customAudioUrl: null,
      },
    },
  ],
  photos,
  2,
);
assert.equal(kept[0]?.echoId, "real-echo");
assert.equal(kept.length, 2);
assert.equal(
  kept.some(
    (wave) =>
      isLaunchWaveId(wave.echoId) &&
      ((wave.a.countryCode === "JP" && wave.b.countryCode === "BR") ||
        (wave.a.countryCode === "BR" && wave.b.countryCode === "JP")),
  ),
  false,
);

const animated = waveRevealLifetimeMs({ animationPlays: true });
const fallback = waveRevealLifetimeMs({ animationPlays: false });
assert.ok(animated >= WAVE_REVEAL_MS);
assert.ok(animated < WAVE_REVEAL_MAX_MS);
assert.ok(fallback > 0);
assert.ok(fallback < animated);
assert.ok(fallback <= WAVE_REVEAL_MAX_MS);

const projection = geoEqualEarth().translate([180, 90]).scale(70);
const straight = atlasArcSegment(projection, [139.6, 35.6], [-47.9, -15.8], {
  straight: true,
});
assert.equal(straight?.mode, "line");
const d = atlasArcPathD(projection, [139.6, 35.6], [-47.9, -15.8], {
  straight: true,
});
assert.equal(d.includes("Q"), false);
assert.equal(d.startsWith("M"), true);
assert.equal(d.includes("L"), true);
const bowed = atlasArcPathD(projection, [139.6, 35.6], [-47.9, -15.8]);
assert.equal(bowed.includes("Q"), true);

const sampleSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../data/samplePhotos.ts"),
  "utf8",
);
const catalogueCodes = [
  ...new Set(
    [...sampleSrc.matchAll(/countryCode:\s*"([A-Z]{2})"/g)].map((match) => match[1]),
  ),
];
assert.ok(catalogueCodes.length >= LAUNCH_WAVE_TARGET);
const cataloguePhotos: LaunchPhoto[] = catalogueCodes.map((code, index) => ({
  id: `catalogue-${index}`,
  uri: `https://img.example/${code}`,
  country: code ?? "Unknown",
  countryCode: code ?? "ZZ",
  countryFlag: "🏳",
  theme: "moment",
}));
const catalogue = prepareMapWaves([], [], cataloguePhotos);
assert.equal(catalogue.length, LAUNCH_WAVE_TARGET);
assert.ok(catalogue.every((wave) => isLaunchWaveId(wave.id)));
assert.ok(catalogue.every((wave) => wave.color === MAP_OTHER_WAVE_COLOR));

console.log("map wave tests passed");
