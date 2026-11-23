import assert from "node:assert/strict";
import { test } from "node:test";

import { waveListPlace, waveListWhen } from "../core/waveListMeta";

test("waveListPlace prefers city, else full country name", () => {
  assert.equal(waveListPlace({ city: "London", countryCode: "GB" }), "London");
  assert.equal(waveListPlace({ countryCode: "GB" }), "United Kingdom");
  assert.equal(waveListPlace({ countryCode: "FR" }), "France");
  assert.equal(waveListPlace({ countryCode: null }), "Somewhere");
  assert.equal(waveListPlace({}), "Somewhere");
});

test("waveListWhen follows the device locale order", () => {
  const iso = "2026-06-15T11:00:00+01:00";
  const gb = waveListWhen(iso, "en-GB");
  const us = waveListWhen(iso, "en-US");
  assert.ok(gb);
  assert.ok(us);
  // en-GB puts the day before the month; en-US the reverse.
  assert.match(gb!, /^15\b/);
  assert.match(us!, /\bJun\b/);
  assert.match(gb!, /\bJun\b/);
  assert.match(us!, /\b15\b/);
  assert.equal(waveListWhen(null), null);
});
