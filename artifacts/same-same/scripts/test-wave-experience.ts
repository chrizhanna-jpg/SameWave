/**
 * Wave copy rules: name, ordinal, distance unit, weather word, taken-at.
 * Run: pnpm exec tsx scripts/test-wave-experience.ts
 */
import assert from "node:assert/strict";
import {
  formatSeparation,
  formatTakenAt,
  haversineMiles,
  isInUtcYear,
  ordinal,
  prefersMiles,
  waveNameFromVibes,
  weatherWord,
  yearCountLabels,
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

assert.deepEqual(yearCountLabels(12345, 678), ["12,345 Ripples this year", "678 Waves this year"]);
assert.deepEqual(yearCountLabels(1, 1), ["1 Ripple this year", "1 Wave this year"]);
assert.deepEqual(yearCountLabels(0, 0), ["0 Ripples this year", "0 Waves this year"]);
assert.deepEqual(yearCountLabels(-3, 2.4), ["0 Ripples this year", "2 Waves this year"]);
const now = new Date("2026-10-10T12:00:00Z");
assert.equal(isInUtcYear("2026-01-01T00:00:00Z", now), true);
assert.equal(isInUtcYear("2025-12-31T23:59:59Z", now), false);
assert.equal(isInUtcYear(undefined, now), false);

console.log("wave experience copy checks passed");
