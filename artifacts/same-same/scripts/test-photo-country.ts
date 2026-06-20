import assert from "node:assert/strict";
import { SAMPLE_PHOTOS } from "../data/samplePhotos";
import {
  displayCountryCode,
  matchCountryFieldsFromCapture,
  photoCountryDisplay,
  resolveCaptureCountryCode,
} from "../utils/photoCountry";

assert.equal(displayCountryCode("jp"), "JP");
assert.equal(displayCountryCode(null), undefined);
assert.equal(displayCountryCode(undefined), undefined);
// Profile / declared country must not influence display.
assert.equal(displayCountryCode("GB"), "GB");

const missing = photoCountryDisplay(undefined);
assert.equal(missing.name, "Somewhere");
assert.equal(missing.flag, "🌍");
assert.equal(missing.code, undefined);

const tokyo = photoCountryDisplay("JP");
assert.equal(tokyo.name, "Japan");
assert.equal(tokyo.code, "JP");
assert.equal(tokyo.flag, "🇯🇵");

const stock = SAMPLE_PHOTOS[0]!;
assert.equal(stock.captureCountryCode, "ET");
assert.equal(
  resolveCaptureCountryCode(undefined, stock.uri),
  "ET",
);
assert.equal(
  photoCountryDisplay(undefined, { sampleUri: stock.uri }).name,
  "Ethiopia",
);

const fields = matchCountryFieldsFromCapture({
  myCaptureCountryCode: "US",
  theirCaptureCountryCode: null,
  theirPhoto: stock.uri,
});
assert.equal(fields.myCountry, "United States");
assert.equal(fields.theirCountry, "Ethiopia");
assert.equal(fields.theirCountryCode, "ET");
assert.equal(fields.theirCaptureCountryCode, "ET");

console.log("test-photo-country: ok");
