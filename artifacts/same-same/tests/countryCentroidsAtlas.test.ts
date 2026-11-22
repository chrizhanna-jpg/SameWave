/**
 * Every country centroid and every sample-wave lat/lng must land inside that
 * country's polygon in the bundled world-atlas countries-110m. Failures list
 * the mismatch loudly so wrong pins never ship quietly.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ATLAS_POLYGON_EXCEPTIONS,
  atlasCountryFeature,
  pointInAtlasCountry,
} from "../data/atlasCountries";
import { COUNTRY_CENTROID_LON_LAT } from "../data/countryCentroids";
import { TEST_PHOTO_META } from "../assets/test-photos/fixtures";

test("every country centroid lies inside its atlas polygon (or is an allowed exception)", () => {
  const mismatches: string[] = [];
  const missingFeature: string[] = [];
  const exceptions: string[] = [];

  for (const [code, lonLat] of Object.entries(COUNTRY_CENTROID_LON_LAT)) {
    if (ATLAS_POLYGON_EXCEPTIONS.has(code)) {
      exceptions.push(code);
      continue;
    }
    const feat = atlasCountryFeature(code);
    if (!feat) {
      missingFeature.push(
        `${code} — no countries-110m polygon (add to ATLAS_POLYGON_EXCEPTIONS or fix iso map)`,
      );
      continue;
    }
    if (!pointInAtlasCountry(code, lonLat)) {
      mismatches.push(
        `${code} centroid [${lonLat[0]}, ${lonLat[1]}] is outside atlas polygon "${feat.properties.name}"`,
      );
    }
  }

  if (missingFeature.length || mismatches.length) {
    const lines = [
      "",
      "Country centroid / atlas mismatches:",
      ...missingFeature.map((m) => `  MISSING: ${m}`),
      ...mismatches.map((m) => `  OUTSIDE: ${m}`),
      "",
      `Checked ${Object.keys(COUNTRY_CENTROID_LON_LAT).length} centroids; ${exceptions.length} small-island/exception codes skipped.`,
    ];
    assert.fail(lines.join("\n"));
  }
});

test("every sample wave lat/lng lies inside its declared country polygon", () => {
  const mismatches: string[] = [];
  for (const meta of TEST_PHOTO_META) {
    const code = meta.countryCode;
    if (ATLAS_POLYGON_EXCEPTIONS.has(code)) continue;
    const lonLat: [number, number] = [meta.lng, meta.lat];
    if (!atlasCountryFeature(code)) {
      mismatches.push(
        `sample ${meta.id} (${code}): no atlas polygon — add exception or fix code`,
      );
      continue;
    }
    if (!pointInAtlasCountry(code, lonLat)) {
      mismatches.push(
        `sample ${meta.id} (${code}) [${meta.lng}, ${meta.lat}] outside atlas polygon`,
      );
    }
  }
  if (mismatches.length) {
    assert.fail(`\nSample wave coordinate mismatches:\n${mismatches.map((m) => `  ${m}`).join("\n")}\n`);
  }
});
