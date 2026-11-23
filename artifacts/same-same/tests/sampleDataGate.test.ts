/**
 * Fixture gating: Sample data must never leak into release builds or real
 * API paths. Covers build flag + Account toggle + local match-back only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  isPreviewOfferId,
  PREVIEW_OFFER_SPECS,
  previewWaveAfterAccept,
  resetPreviewOfferResolution,
  resolvePreviewOffer,
  withOptionalSampleOffers,
} from "../core/sampleOffers";
import {
  testPhotosBuildEnabled,
  withOptionalSampleWaves,
  withOptionalTestPhotos,
} from "../core/testPhotos";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const samplesOn = process.env.EXPO_PUBLIC_TEST_PHOTOS === "1";

test("build gate: testPhotosBuildEnabled mirrors EXPO_PUBLIC_TEST_PHOTOS", () => {
  assert.equal(testPhotosBuildEnabled(), samplesOn);
});

test("sample offers stay empty when Sample data is off or build flag is off", () => {
  resetPreviewOfferResolution();
  assert.deepEqual(withOptionalSampleOffers([], { useSampleData: false }), []);
  if (!samplesOn) {
    assert.deepEqual(withOptionalSampleOffers([], { useSampleData: true }), []);
  }
});

test("sample offers seed multi pending Ripples only when gated on", () => {
  resetPreviewOfferResolution();
  const seeded = withOptionalSampleOffers([], { useSampleData: true });
  if (!samplesOn) {
    assert.deepEqual(seeded, []);
    return;
  }
  assert.equal(seeded.length, 3);
  for (const offer of seeded) {
    assert.ok(isPreviewOfferId(offer.id));
    assert.ok(offer.myPhotoId.startsWith("test_sample_"));
    assert.ok(offer.theirPhotoId.startsWith("test_sample_"));
    assert.ok(offer.theirEmotion);
    assert.ok(offer.theirTopic);
    assert.ok(offer.theirCountryCode);
  }
  // Live offers are preserved; samples prepend when missing.
  const live = [
    {
      id: "live-1",
      myPhotoId: "a",
      theirPhotoId: "b",
      createdAt: "2026-01-01T00:00:00.000Z",
      myUri: null,
      theirUri: null,
      theirEmotion: null,
      theirTopic: null,
      theirCountryCode: null,
    },
  ];
  const mixed = withOptionalSampleOffers(live, { useSampleData: true });
  assert.equal(mixed.length, 4);
  assert.equal(mixed[mixed.length - 1]!.id, "live-1");
});

test("sample Waves stay live-only when toggle is off (and when build flag is off)", () => {
  const live = [
    {
      id: "live-wave",
      formedAt: "2026-01-01T00:00:00.000Z",
      mine: {
        photoId: "m",
        uri: null,
        countryCode: null,
        countrySource: null,
        takenAt: null,
        theme: null,
        emotion: null,
      },
      theirs: {
        photoId: "t",
        uri: null,
        countryCode: null,
        countrySource: null,
        takenAt: null,
        theme: null,
        emotion: null,
      },
    },
  ];
  assert.deepEqual(
    withOptionalSampleWaves(live, { useSamplePhotos: false }),
    live,
  );
  // Avoid requiring the RN asset catalog under node:test when the flag is on.
  if (!samplesOn) {
    assert.deepEqual(
      withOptionalSampleWaves(live, { useSamplePhotos: true }),
      live,
    );
  }
  const wavesScreen = readFileSync(
    path.join(root, "app/(tabs)/waves.tsx"),
    "utf8",
  );
  assert.match(wavesScreen, /withOptionalSampleWaves\(waves,\s*\{\s*useSamplePhotos:\s*useSampleData/);
});

test("Match deck samples also require the Sample data toggle", () => {
  const live = [
    {
      id: "live-c",
      score: 1,
      uri: "https://example.com/x.jpg",
      createdAt: null,
      theme: null,
      emotion: null,
      takenAt: null,
      countryCode: null,
    },
  ];
  assert.deepEqual(
    withOptionalTestPhotos(live, { useSamplePhotos: false }),
    live,
  );
  // Catalog pulls React Native — only assert the gate-off path in node:test.
  if (!samplesOn) {
    assert.deepEqual(
      withOptionalTestPhotos(live, { useSamplePhotos: true }),
      live,
    );
  }
  const match = readFileSync(path.join(root, "app/match.tsx"), "utf8");
  assert.match(match, /withOptionalTestPhotos/);
  assert.match(match, /useSamplePhotos:\s*samplesOn/);
});

test("local match-back never calls the network path for preview offer ids", () => {
  resetPreviewOfferResolution();
  const offerId = PREVIEW_OFFER_SPECS[0]!.id;
  resolvePreviewOffer(offerId, "accepted");
  if (samplesOn) {
    assert.ok(previewWaveAfterAccept(offerId));
  } else {
    assert.equal(previewWaveAfterAccept(offerId), null);
  }
  // Live ids are never treated as preview fixtures.
  assert.equal(isPreviewOfferId("echo-123"), false);
  resolvePreviewOffer("echo-123", "accepted");
  assert.equal(previewWaveAfterAccept("echo-123"), null);
  resetPreviewOfferResolution();

  const app = readFileSync(path.join(root, "state/AppState.tsx"), "utf8");
  // Preview branch returns before acceptOffer / dismissOffer.
  const previewBlock = app.slice(
    app.indexOf("if (isPreviewOfferId(offerId))"),
    app.indexOf("if (verdict === \"same\") await backend.acceptOffer"),
  );
  assert.match(previewBlock, /resolvePreviewOffer/);
  assert.match(previewBlock, /previewWaveAfterAccept\(offerId\)/);
  assert.doesNotMatch(previewBlock, /backend\.(accept|dismiss)Offer/);
});

test("Account Sample data row is preview-only and never in release stub", () => {
  const toggle = readFileSync(
    path.join(root, "assets/test-photos/SamplePhotosToggleRow.tsx"),
    "utf8",
  );
  assert.match(toggle, /Sample data/);
  assert.match(toggle, /Ripples, Waves, and Match/);
  assert.doesNotMatch(toggle, /Sample photos \(preview\)/);

  const account = readFileSync(path.join(root, "app/account.tsx"), "utf8");
  assert.match(account, /SamplePhotosToggleRow/);
  assert.match(account, /EXPO_PUBLIC_TEST_PHOTOS/);
  assert.match(account, /samplesAvailable/);

  const stub = readFileSync(
    path.join(root, "assets/test-photos/stub.disabled.js"),
    "utf8",
  );
  assert.match(stub, /function SamplePhotosToggleRow/);
  assert.match(stub, /return null/);
});

test("preview offer ids never look like production echo / wave ids", () => {
  for (const spec of PREVIEW_OFFER_SPECS) {
    assert.ok(spec.id.startsWith("preview-inbox-offer-"));
    assert.ok(spec.waveId.startsWith("test_wave_"));
    assert.ok(spec.minePhotoId.startsWith("test_sample_"));
    assert.ok(spec.theirPhotoId.startsWith("test_sample_"));
  }
});
