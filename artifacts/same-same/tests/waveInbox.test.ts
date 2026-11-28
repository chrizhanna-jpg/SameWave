import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { offerFromCard, waveFromCard } from "../backend/http";
import {
  findOfferIncludingPreview,
  inboxOfferTheirThumbSource,
  isPreviewOfferId,
  peekPreviewOfferResolution,
  PREVIEW_OFFER_MY_PHOTO_ID,
  PREVIEW_OFFER_SPECS,
  PREVIEW_OFFER_THEIR_PHOTO_ID,
  PREVIEW_OFFER_WAVE_ID,
  previewWaveAfterAccept,
  previewWaveIdForOffer,
  resetPreviewOfferResolution,
  resolvePreviewOffer,
  withOptionalSampleOffers,
} from "../core/sampleOffers";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const samplesOn = process.env.EXPO_PUBLIC_TEST_PHOTOS === "1";

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

test("waveFromCard keeps both mine and theirs uris from API-shaped https cards", () => {
  const wave = waveFromCard({
    id: "echo-99",
    mutualAt: "2026-11-20T15:00:00Z",
    mine: {
      id: "photo-mine",
      uri: "https://cdn.example.com/api/photos/photo-mine/image",
      theme: "mountains",
      emotion: "calm",
      captureCountryCode: "GB",
      capturedAt: "2026-06-15T12:00:00Z",
    },
    theirs: {
      id: "photo-theirs",
      uri: "/api/photos/photo-theirs/image",
      theme: "coffee",
      emotion: "joy",
      captureCountryCode: "FR",
      capturedAt: "2026-06-15T12:00:45Z",
    },
  });
  assert.ok(wave);
  assert.equal(wave!.id, "echo-99");
  assert.equal(wave!.mine.photoId, "photo-mine");
  assert.equal(wave!.theirs.photoId, "photo-theirs");
  assert.equal(wave!.mine.uri, "https://cdn.example.com/api/photos/photo-mine/image");
  assert.equal(wave!.theirs.uri, "/api/photos/photo-theirs/image");
  assert.equal(wave!.mine.emotion, "calm");
  assert.equal(wave!.theirs.theme, "coffee");
  // Inbox PairMomentCard reads both sides for the matched pair thumbs.
  assert.ok(wave!.mine.uri && wave!.theirs.uri);
});

test("preview sample offers are gated, multi-pair, and use fixture photo ids", () => {
  resetPreviewOfferResolution();
  const seeded = withOptionalSampleOffers([], { useSampleData: true });
  if (samplesOn) {
    assert.equal(seeded.length, PREVIEW_OFFER_SPECS.length);
    assert.equal(seeded[0]!.id, "preview-inbox-offer-1");
    assert.equal(seeded[0]!.myPhotoId, PREVIEW_OFFER_MY_PHOTO_ID);
    assert.equal(seeded[0]!.theirPhotoId, PREVIEW_OFFER_THEIR_PHOTO_ID);
    assert.ok(seeded[0]!.theirEmotion);
    assert.ok(seeded[0]!.theirTopic);
    assert.ok(seeded[0]!.theirCountryCode);
    assert.ok(inboxOfferTheirThumbSource(seeded[0]!), "preview offer needs their moment thumb");
    assert.ok(findOfferIncludingPreview([], "preview-inbox-offer-1"));
    assert.deepEqual(withOptionalSampleOffers([], { useSampleData: false }), []);
  } else {
    assert.deepEqual(seeded, []);
  }
  assert.equal(isPreviewOfferId("preview-inbox-offer-1"), true);
  assert.equal(isPreviewOfferId("live"), false);
});

test("preview match-back resolves one offer and yields its sample Wave", () => {
  resetPreviewOfferResolution();
  const offerId = "preview-inbox-offer-1";
  if (!samplesOn) {
    assert.equal(previewWaveAfterAccept(offerId), null);
    return;
  }
  assert.equal(
    withOptionalSampleOffers([], { useSampleData: true }).length,
    PREVIEW_OFFER_SPECS.length,
  );
  resolvePreviewOffer(offerId, "accepted");
  assert.equal(peekPreviewOfferResolution(offerId), "accepted");
  const remaining = withOptionalSampleOffers([], { useSampleData: true });
  assert.equal(remaining.length, PREVIEW_OFFER_SPECS.length - 1);
  assert.ok(!remaining.some((o) => o.id === offerId));
  const wave = previewWaveAfterAccept(offerId);
  assert.ok(wave);
  assert.equal(wave!.id, PREVIEW_OFFER_WAVE_ID);
  assert.equal(wave!.id, previewWaveIdForOffer(offerId));
  assert.equal(wave!.mine.photoId, PREVIEW_OFFER_MY_PHOTO_ID);
  assert.equal(wave!.theirs.photoId, PREVIEW_OFFER_THEIR_PHOTO_ID);
  resetPreviewOfferResolution();
});

test("Wave inbox has no card actions; pending tap opens Match Offer a Wave / Pass", () => {
  const waves = readFileSync(path.join(root, "app/(tabs)/waves.tsx"), "utf8");
  assert.doesNotMatch(waves, /Wave back/);
  assert.doesNotMatch(waves, /label="Dismiss"/);
  assert.doesNotMatch(waves, /respondToOffer/);
  assert.doesNotMatch(waves, /onWaveBack|onDismiss/);
  assert.match(waves, /Ripples received/);
  assert.match(waves, /No Ripples received|Checking for moments/);
  assert.match(waves, /Matched their moment to yours/);
  assert.match(waves, /Moments people matched to yours/);
  assert.match(waves, /They matched back/);
  assert.match(waves, /Moments where they matched back/);
  assert.match(waves, /PairMomentCard/);
  assert.match(waves, /pairThumbs|Matched photo pair/);
  assert.match(waves, /inboxOfferTheirThumbSource/);
  assert.match(waves, /inboxOfferMyThumbSource/);
  assert.match(waves, /label="Your photo"/);
  assert.match(waves, /label="Their photo"/);
  assert.match(waves, /mineUri|minePhotoId/);
  assert.match(waves, /theirUri|theirPhotoId/);
  assert.match(waves, /Waves/);
  assert.match(waves, /No Waves yet/);
  assert.match(waves, /styles\.divider|colors\.line/);
  assert.match(waves, /Open their moment/);
  assert.doesNotMatch(waves, /\bInbox\b/);
  assert.doesNotMatch(waves, /Your Waves/);
  // Pending → Match decision (not WaveJoin shortcut).
  assert.match(waves, /pathname:\s*"\/match"/);
  assert.match(waves, /stage:\s*"wave"/);
  assert.match(waves, /offerId:\s*offer\.id/);
  assert.match(waves, /from:\s*"waves"/);
  assert.doesNotMatch(waves, /PREVIEW_OFFER_WAVE_ID/);
  // Sample data toggle gates fixtures (never force-seed when live empty alone).
  assert.match(waves, /useSampleData/);
  assert.match(waves, /withOptionalSampleWaves/);
  assert.match(waves, /withOptionalSampleOffers/);
  // Calm canvas: wave mark watermark, no photo scene; headers/empty without Frost panels.
  assert.match(waves, /mark="wave"/);
  assert.match(waves, /scene="none"/);
  assert.match(waves, /ripplesHeading|colors\.rippleHeading/);
  assert.match(waves, /wavesHeading|colors\.waveHeading/);
  assert.doesNotMatch(waves, /headingFrost/);
  assert.doesNotMatch(waves, /sceneFor\.home/);
  assert.doesNotMatch(waves, /tone="moon"/);
  assert.doesNotMatch(waves, /tone="quiet"/);
  // Pair moment cards still use Frost; section headers/empty states do not.
  assert.match(waves, /<Frost\b/);

  const match = readFileSync(path.join(root, "app/match.tsx"), "utf8");
  assert.match(match, /offerId/);
  assert.match(match, /inboxDecision/);
  assert.match(match, /respondToOffer/);
  assert.match(match, /accessibilityLabel="Pass"/);
  assert.match(match, /Offer a Wave/);
  assert.match(match, /Matches back to form a Wave/);
  assert.match(match, /previewWaveIdForOffer/);
  assert.match(match, /Sample data/);

  // Mutual Waves: card tap → full-screen Wave only (no card buttons).
  assert.match(waves, /pathname:\s*"\/wave\/\[id\]"/);
  assert.match(waves, /openWave|onOpen=\{\(\) => openWave/);

  const waveScreen = readFileSync(path.join(root, "app/wave/[id].tsx"), "utf8");
  assert.match(waveScreen, /SoftIconDisc/);
  assert.match(waveScreen, /closeToWaves|\/\(tabs\)\/waves/);
  assert.match(waveScreen, /accessibilityLabel="Close"/);
  assert.match(waveScreen, /accessibilityHint="Returns to the Waves inbox"/);
  // Existing full-screen actions only — no new invent.
  assert.match(waveScreen, /Report this photo/);
  assert.match(waveScreen, /Play |Stop|onPlay/);
  assert.match(waveScreen, /Discover|setDetails/);
  assert.match(waveScreen, /Hide details/);
  assert.doesNotMatch(waveScreen, /Wave back|Dismiss|Offer a Wave/);

  const app = readFileSync(path.join(root, "state/AppState.tsx"), "utf8");
  assert.doesNotMatch(app, /offersToAccept\(/);
  assert.match(app, /isPreviewOfferId/);
  assert.match(app, /previewWaveAfterAccept/);
  assert.match(app, /resolvePreviewOffer\(/);
});
