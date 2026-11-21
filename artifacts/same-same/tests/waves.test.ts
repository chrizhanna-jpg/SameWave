import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeRipples, photoHistory, ripplesFromLegacyState } from "../core/history";
import type { Ripple, Wave } from "../core/types";
import { clipUrlFor, vibeFor } from "../core/vibes";
import { findWaveByPhotos, sortWaves, unseenWaves } from "../core/waves";
import { PICKER_VIBE_IDS, VIBES } from "../data/vibes";

const wave = (id: string, formedAt: string | null, mine = `${id}-m`, theirs = `${id}-t`): Wave => ({
  id,
  formedAt,
  mine: { photoId: mine, uri: `data:${id}`, countryCode: "GB", takenAt: formedAt },
  theirs: { photoId: theirs, uri: null, countryCode: "FR", takenAt: formedAt },
});

const BASELINE = "2026-11-01T00:00:00Z";

test("Waves formed before this app was first opened go straight to the map", () => {
  const waves = [wave("old", "2026-10-01T00:00:00Z"), wave("new", "2026-11-02T00:00:00Z")];
  assert.deepEqual(unseenWaves(waves, [], BASELINE).map((w) => w.id), ["new"]);
});

test("an opened Wave is never shown as new again", () => {
  const waves = [wave("a", "2026-11-02T00:00:00Z"), wave("b", "2026-11-03T00:00:00Z")];
  assert.deepEqual(unseenWaves(waves, ["a"], BASELINE).map((w) => w.id), ["b"]);
  assert.deepEqual(unseenWaves(waves, ["a", "b"], BASELINE), []);
});

test("new Waves are opened oldest first", () => {
  const waves = [wave("later", "2026-11-05T00:00:00Z"), wave("sooner", "2026-11-02T00:00:00Z")];
  assert.deepEqual(unseenWaves(waves, [], BASELINE).map((w) => w.id), ["sooner", "later"]);
});

test("a Wave with no date is not treated as new once a baseline exists", () => {
  assert.deepEqual(unseenWaves([wave("x", null)], [], BASELINE), []);
  assert.deepEqual(unseenWaves([wave("x", null)], [], null).map((w) => w.id), ["x"]);
});

test("the map lists Waves newest first", () => {
  const sorted = sortWaves([
    wave("a", "2026-10-01T00:00:00Z"),
    wave("c", null),
    wave("b", "2026-10-09T00:00:00Z"),
  ]);
  assert.deepEqual(sorted.map((w) => w.id), ["b", "a", "c"]);
});

test("a notification's two photo ids find the Wave in either order", () => {
  const waves = [wave("w", "2026-11-02T00:00:00Z", "p1", "p2")];
  assert.equal(findWaveByPhotos(waves, "p1", "p2")?.id, "w");
  assert.equal(findWaveByPhotos(waves, "p2", "p1")?.id, "w");
  assert.equal(findWaveByPhotos(waves, "p1", "p3"), null);
});

test("photos from the previous app are carried into the history", () => {
  const legacy = JSON.stringify({
    myPhotos: [
      {
        uri: "file:///data/photo-1.jpg",
        uploadedAt: Date.parse("2026-09-01T10:00:00Z"),
        backendId: "srv-1",
        theme: "coffee",
        tags: ["morning", 7],
        subjects: ["cup"],
        musicGenre: "calm",
        captureCountryCode: "gb",
      },
      { uri: "https://example.com/x.jpg", backendId: "srv-2", uploadedAt: "2026-09-03T10:00:00Z" },
      { uri: "file:///never-uploaded.jpg", localId: "local-only" },
      { backendId: "srv-1", uri: "file:///duplicate.jpg" },
      null,
    ],
  });
  const ripples = ripplesFromLegacyState(legacy);
  assert.deepEqual(ripples.map((r) => r.photoId), ["srv-1", "srv-2"]);
  assert.equal(ripples[0]?.localUri, "file:///data/photo-1.jpg");
  assert.equal(ripples[0]?.countryCode, "GB");
  assert.equal(ripples[0]?.vibe, "calm");
  assert.deepEqual(ripples[0]?.tags, ["morning"]);
  assert.equal(ripples[1]?.localUri, null);
});

test("unreadable old data is skipped instead of breaking the app", () => {
  assert.deepEqual(ripplesFromLegacyState(null), []);
  assert.deepEqual(ripplesFromLegacyState("{not json"), []);
  assert.deepEqual(ripplesFromLegacyState(JSON.stringify({ myPhotos: "nope" })), []);
  assert.deepEqual(ripplesFromLegacyState(JSON.stringify([1, 2])), []);
});

test("history has each photo once, newest first, with the best picture known", () => {
  const sent = (photoId: string, sentAt: string, localUri: string | null): Ripple => ({
    photoId,
    sentAt,
    localUri,
    countryCode: null,
    vibe: null,
    hasRecording: false,
    theme: "",
    tags: [],
    subjects: [],
    reach: { passes: 0, lastPassAt: null, offeredIds: [] },
  });
  const merged = mergeRipples(
    [sent("a", "2026-10-02T00:00:00Z", "file:///a.jpg")],
    [sent("a", "2026-10-02T00:00:00Z", null), sent("b", "2026-10-05T00:00:00Z", null)],
  );
  assert.deepEqual(merged.map((r) => r.photoId), ["b", "a"]);
  assert.equal(merged[1]?.localUri, "file:///a.jpg");

  const history = photoHistory(merged, [
    wave("w1", "2026-10-06T00:00:00Z", "b"),
    wave("w2", "2026-10-07T00:00:00Z", "from-another-device"),
  ]);
  assert.deepEqual(history.map((h) => h.photoId), ["from-another-device", "b", "a"]);
  assert.equal(history[1]?.uri, "data:w1");
  assert.equal(history[2]?.uri, "file:///a.jpg");
});

test("every feeling offered when sending is one the server accepts and has clips", () => {
  const serverAccepts = [
    "joy", "overjoyed", "elated", "amusement", "cheers", "yum", "love", "caring", "romance",
    "gratitude", "pride", "hope", "wonder", "fascinated", "calm", "content", "chilling",
    "relaxed", "tired", "nostalgia", "longing", "sad", "heartbroken", "lonely", "grief",
    "fear", "scared", "afraid", "anger", "stress", "passion",
  ];
  assert.deepEqual([...VIBES.map((v) => v.id)].sort(), [...serverAccepts].sort());
  for (const id of PICKER_VIBE_IDS) {
    assert.ok(serverAccepts.includes(id), id);
    assert.ok((vibeFor(id)?.clips.length ?? 0) > 0, id);
  }
});

test("a photo always gets the same clip for its feeling", () => {
  const first = clipUrlFor("calm", "photo-123");
  assert.ok(first?.startsWith("https://incompetech.com/"));
  assert.equal(clipUrlFor("calm", "photo-123"), first);
  assert.equal(clipUrlFor("not-a-feeling", "photo-123"), null);
  assert.equal(clipUrlFor(null, "photo-123"), null);
});
