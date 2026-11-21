import assert from "node:assert/strict";
import { test } from "node:test";

import { BONUS_RANK, describeGap, matchBonuses } from "../core/bonuses";

const at = (iso: string, countryCode: string | null) => ({ takenAt: iso, countryCode });
const base = "2026-10-10T12:00:00Z";
const plus = (ms: number) => new Date(Date.parse(base) + ms).toISOString();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test("each time window gives its own bonus, strongest first", () => {
  assert.deepEqual(matchBonuses(at(base, null), at(plus(30 * MIN), null)).time, [
    "hour",
    "day",
    "week",
    "month",
  ]);
  assert.equal(matchBonuses(at(base, null), at(plus(5 * HOUR), null)).strongestTime, "day");
  assert.equal(matchBonuses(at(base, null), at(plus(3 * DAY), null)).strongestTime, "week");
  assert.equal(matchBonuses(at(base, null), at(plus(20 * DAY), null)).strongestTime, "month");
  assert.equal(matchBonuses(at(base, null), at(plus(45 * DAY), null)).strongestTime, null);
});

test("window edges are inclusive and order does not matter", () => {
  assert.equal(matchBonuses(at(base, null), at(plus(HOUR), null)).strongestTime, "hour");
  assert.equal(matchBonuses(at(base, null), at(plus(HOUR + 1), null)).strongestTime, "day");
  assert.equal(matchBonuses(at(plus(HOUR), null), at(base, null)).strongestTime, "hour");
});

test("same country also counts as same continent", () => {
  const b = matchBonuses(at(base, "gb"), at(base, "GB"));
  assert.deepEqual(b.place, ["country", "continent"]);
  assert.equal(b.strongestPlace, "country");
});

test("different countries on one continent share the continent only", () => {
  assert.deepEqual(matchBonuses(at(base, "GB"), at(base, "FR")).place, ["continent"]);
  assert.deepEqual(matchBonuses(at(base, "GB"), at(base, "JP")).place, []);
});

test("unknown time or country gives no bonus rather than a guess", () => {
  const b = matchBonuses({ takenAt: null, countryCode: null }, at(base, "GB"));
  assert.deepEqual(b.time, []);
  assert.deepEqual(b.place, []);
  assert.equal(b.headline, null);
  assert.equal(b.rank, null);
  assert.equal(matchBonuses(at("not a date", "??"), at(base, "GB")).headline, null);
});

test("the headline joins the strongest time and the strongest place", () => {
  assert.equal(
    matchBonuses(at(base, "GB"), at(plus(5 * HOUR), "FR")).headline,
    "Same day, same continent",
  );
  assert.equal(
    matchBonuses(at(base, "GB"), at(plus(10 * MIN), "GB")).headline,
    "Same hour, same country",
  );
  assert.equal(matchBonuses(at(base, "GB"), at(plus(3 * DAY), "JP")).headline, "Same week");
  assert.equal(matchBonuses(at(base, "GB"), at(plus(90 * DAY), "IT")).headline, "Same continent");
  assert.equal(matchBonuses(at(base, "GB"), at(plus(90 * DAY), "BR")).headline, null);
});

test("rank follows hour, day, week, month, country, continent", () => {
  assert.deepEqual(BONUS_RANK, ["hour", "day", "week", "month", "country", "continent"]);
  assert.equal(matchBonuses(at(base, "GB"), at(plus(MIN), "JP")).rank, 0);
  assert.equal(matchBonuses(at(base, "GB"), at(plus(20 * DAY), "GB")).rank, 3);
  assert.equal(matchBonuses(at(base, "GB"), at(plus(90 * DAY), "GB")).rank, 4);
  assert.equal(matchBonuses(at(base, "GB"), at(plus(90 * DAY), "FR")).rank, 5);
});

test("a same-country pair is a normal match with a place bonus", () => {
  const b = matchBonuses(at(base, "GB"), at(plus(2 * DAY), "GB"));
  assert.equal(b.headline, "Same week, same country");
});

test("the gap is described in plain words", () => {
  assert.equal(describeGap(base, plus(30 * 1000)), "Taken at the same moment");
  assert.equal(describeGap(base, plus(20 * MIN)), "Taken 20 minutes apart");
  assert.equal(describeGap(base, plus(HOUR)), "Taken 1 hour apart");
  assert.equal(describeGap(base, plus(3 * DAY)), "Taken 3 days apart");
  assert.equal(describeGap(base, plus(90 * DAY)), "Taken 3 months apart");
  assert.equal(describeGap(base, null), null);
});
