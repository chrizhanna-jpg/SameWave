/**
 * Wave copy rules: name, ordinal, distance unit, weather word, taken-at.
 * Run: pnpm exec tsx scripts/test-wave-experience.ts
 */
import assert from "node:assert/strict";
import {
  formatSeparation,
  formatTakenAt,
  haversineMiles,
  ordinal,
  prefersMiles,
  waveNameFromVibes,
  weatherWord,
} from "../utils/waveCopy";

assert.equal(waveNameFromVibes("quiet", "morning"), "The Quiet Morning Wave");
assert.equal(waveNameFromVibes("#GoldenHour", "golden hour"), "The Golden Hour Wave");
assert.equal(waveNameFromVibes("Quiet", ""), "The Quiet Wave");
assert.equal(ordinal(1), "1st");
assert.equal(ordinal(2), "2nd");
assert.equal(ordinal(3), "3rd");
assert.equal(ordinal(11), "11th");
assert.equal(ordinal(22), "22nd");
assert.equal(prefersMiles("en-US"), true);
assert.equal(prefersMiles("en-GB"), true);
assert.equal(prefersMiles("fr-FR"), false);
assert.match(formatSeparation(8247, true), /8,247 miles/);
assert.match(formatSeparation(1, false), /kilometres/);
assert.equal(weatherWord(0), "Clear");
assert.equal(weatherWord(61), "Rainy");
assert.equal(weatherWord(null), null);

const miles = haversineMiles([-6.26, 53.35], [139.69, 35.69]);
assert.ok(miles > 5000 && miles < 7000, `dublin-tokyo miles ${miles}`);

const taken = formatTakenAt("2026-10-09T11:14:00.000Z", "JP");
assert.equal(taken, "Taken at 8:14pm");

console.log("wave experience copy checks passed");
