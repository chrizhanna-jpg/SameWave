import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isApproximateCountrySource,
  parseCaptureCountrySource,
  resolveCaptureCountry,
} from "../core/captureCountry";
import { waveListPlace } from "../core/waveListMeta";

test("camera GPS → gps source; gallery coords → photo; none → fallback", () => {
  assert.deepEqual(
    resolveCaptureCountry({
      photoSource: "camera",
      hasCoords: false,
      locatedCountryCode: "FR",
      homeCountryCode: "GB",
    }),
    { captureCountryCode: "FR", captureCountrySource: "gps" },
  );
  assert.deepEqual(
    resolveCaptureCountry({
      photoSource: "library",
      hasCoords: true,
      locatedCountryCode: "IT",
      homeCountryCode: "GB",
    }),
    { captureCountryCode: "IT", captureCountrySource: "photo" },
  );
  assert.deepEqual(
    resolveCaptureCountry({
      photoSource: "camera",
      hasCoords: false,
      locatedCountryCode: null,
      homeCountryCode: "GB",
    }),
    { captureCountryCode: "GB", captureCountrySource: "fallback" },
  );
});

test("fallback is approximate; gps/photo are not", () => {
  assert.equal(isApproximateCountrySource("fallback"), true);
  assert.equal(isApproximateCountrySource("gps"), false);
  assert.equal(isApproximateCountrySource("photo"), false);
  assert.equal(isApproximateCountrySource(null), false);
});

test("parseCaptureCountrySource accepts only known values", () => {
  assert.equal(parseCaptureCountrySource("gps"), "gps");
  assert.equal(parseCaptureCountrySource("photo"), "photo");
  assert.equal(parseCaptureCountrySource("fallback"), "fallback");
  assert.equal(parseCaptureCountrySource("other"), null);
});

test("waveListPlace never uses city for fallback / approximate sides", () => {
  assert.equal(
    waveListPlace({ countryCode: "GB", city: "London", countrySource: "fallback" }),
    "United Kingdom",
  );
  assert.equal(
    waveListPlace({ countryCode: "GB", city: "London", approximate: true }),
    "United Kingdom",
  );
  assert.equal(
    waveListPlace({ countryCode: "GB", city: "London", countrySource: "gps" }),
    "London",
  );
});
