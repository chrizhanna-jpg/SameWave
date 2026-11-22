import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { offerFromCard } from "../backend/http";
import {
  inboxOfferMyThumbSource,
  inboxOfferTheirThumbSource,
  isPreviewOfferId,
  PREVIEW_OFFER_WAVE_ID,
  withOptionalSampleOffers,
} from "../core/sampleOffers";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

test("offerFromCard keeps both photo uris, feeling, topic and country for the inbox", () => {
  const offer = offerFromCard({
    id: "e1",
    createdAt: "2026-11-20T12:00:00Z",
    theme: "coffee",
    mine: { id: "mine", uri: "https://example.com/mine.jpg" },
    theirs: {
      id: "theirs",
      uri: "https://example.com/p.jpg",
      emotion: "joy",
      theme: "coffee",
      captureCountryCode: "FR",
    },
  });
  assert.ok(offer);
  assert.equal(offer!.myUri, "https://example.com/mine.jpg");
  assert.equal(offer!.theirEmotion, "joy");
  assert.equal(offer!.theirTopic, "coffee");
  assert.equal(offer!.theirCountryCode, "FR");
  assert.equal(offer!.theirUri, "https://example.com/p.jpg");
});

test("preview sample offer is gated and identifiable", () => {
  const seeded = withOptionalSampleOffers([]);
  if (process.env.EXPO_PUBLIC_TEST_PHOTOS === "1") {
    assert.equal(seeded.length, 1);
    assert.equal(seeded[0]!.id, "preview-inbox-offer-1");
    assert.ok(inboxOfferMyThumbSource(seeded[0]!), "preview offer needs my thumb");
    assert.ok(inboxOfferTheirThumbSource(seeded[0]!), "preview offer needs their thumb");
  } else {
    assert.deepEqual(seeded, []);
  }
  assert.equal(isPreviewOfferId("preview-inbox-offer-1"), true);
  assert.equal(isPreviewOfferId("live"), false);
});

test("Wave inbox has no Wave back / Dismiss; tap opens full-screen Wave", () => {
  const waves = readFileSync(path.join(root, "app/(tabs)/waves.tsx"), "utf8");
  assert.doesNotMatch(waves, /Wave back/);
  assert.doesNotMatch(waves, /label="Dismiss"/);
  assert.doesNotMatch(waves, /respondToOffer/);
  assert.doesNotMatch(waves, /onWaveBack|onDismiss/);
  assert.match(waves, /Ripples received/);
  assert.match(waves, /No Ripples received|Checking for Ripples/);
  assert.match(waves, /Waves/);
  assert.match(waves, /No Waves yet/);
  assert.match(waves, /styles\.divider|colors\.line/);
  assert.match(waves, /Open Wave/);
  assert.doesNotMatch(waves, /\bInbox\b/);
  assert.doesNotMatch(waves, /Your Waves/);
  assert.match(waves, /PREVIEW_OFFER_WAVE_ID|\/wave\/\[id\]/);
  assert.match(waves, /inboxOfferMyThumbSource/);
  assert.match(waves, /inboxOfferTheirThumbSource/);
  assert.equal(PREVIEW_OFFER_WAVE_ID, "test_wave_same_minute");

  const waveScreen = readFileSync(path.join(root, "app/wave/[id].tsx"), "utf8");
  assert.match(waveScreen, /SoftIconDisc/);
  assert.match(waveScreen, /closeToWaves|\/\(tabs\)\/waves/);
  assert.match(waveScreen, /accessibilityLabel="Close"/);

  const app = readFileSync(path.join(root, "state/AppState.tsx"), "utf8");
  assert.doesNotMatch(app, /offersToAccept\(/);
});

test("Map tab hosts the keepsake WorldMap; Waves tab does not", () => {
  const map = readFileSync(path.join(root, "app/(tabs)/map.tsx"), "utf8");
  const waves = readFileSync(path.join(root, "app/(tabs)/waves.tsx"), "utf8");
  assert.match(map, /WorldMap/);
  assert.doesNotMatch(waves, /WorldMap/);
});
