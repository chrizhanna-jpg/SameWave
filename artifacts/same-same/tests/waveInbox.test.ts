import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { offerFromCard } from "../backend/http";
import {
  inboxOfferThumbSource,
  isPreviewOfferId,
  withOptionalSampleOffers,
} from "../core/sampleOffers";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

test("offerFromCard keeps feeling, topic, country and uri for the inbox", () => {
  const offer = offerFromCard({
    id: "e1",
    createdAt: "2026-11-20T12:00:00Z",
    theme: "coffee",
    mine: { id: "mine" },
    theirs: {
      id: "theirs",
      uri: "https://example.com/p.jpg",
      emotion: "joy",
      theme: "coffee",
      captureCountryCode: "FR",
    },
  });
  assert.ok(offer);
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
    // Bundled JPEG source even when Image.resolveAssetSource is missing (node).
    assert.ok(inboxOfferThumbSource(seeded[0]!), "preview offer needs a thumb source");
  } else {
    assert.deepEqual(seeded, []);
  }
  assert.equal(isPreviewOfferId("preview-inbox-offer-1"), true);
  assert.equal(isPreviewOfferId("live"), false);
});

test("Wave tab wires Wave back and Dismiss; AppState no longer auto-accepts", () => {
  const waves = readFileSync(path.join(root, "app/(tabs)/waves.tsx"), "utf8");
  assert.match(waves, /Wave back/);
  assert.match(waves, /Dismiss/);
  assert.match(waves, /respondToOffer/);
  assert.match(waves, /Inbox/);
  assert.match(waves, /Your Waves/);

  const app = readFileSync(path.join(root, "state/AppState.tsx"), "utf8");
  assert.doesNotMatch(app, /offersToAccept\(/);
  assert.match(app, /respondToOffer/);
  assert.match(app, /dismissOffer/);
});

test("Map tab hosts the keepsake WorldMap; Waves tab does not", () => {
  const map = readFileSync(path.join(root, "app/(tabs)/map.tsx"), "utf8");
  const waves = readFileSync(path.join(root, "app/(tabs)/waves.tsx"), "utf8");
  assert.match(map, /WorldMap/);
  assert.doesNotMatch(waves, /WorldMap/);
});
