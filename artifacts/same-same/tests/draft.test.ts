import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clearDraft,
  getDraft,
  getDraftTopic,
  isDraftTopicLocked,
  setDraftEmotion,
  setDraftSong,
  setDraftTopic,
  subscribeDraft,
} from "../state/draft";

describe("draft topic lock", () => {
  it("locks only when asked, and clearDraft unlocks", () => {
    clearDraft();
    setDraftTopic("coffee", { locked: true });
    assert.equal(getDraftTopic(), "coffee");
    assert.equal(isDraftTopicLocked(), true);

    setDraftTopic("family");
    assert.equal(getDraftTopic(), "family");
    assert.equal(isDraftTopicLocked(), false);

    setDraftTopic("coffee", { locked: true });
    clearDraft();
    assert.equal(getDraftTopic(), null);
    assert.equal(isDraftTopicLocked(), false);
  });

  it("null topic cannot stay locked", () => {
    clearDraft();
    setDraftTopic(null, { locked: true });
    assert.equal(isDraftTopicLocked(), false);
  });
});

describe("draft getSnapshot stability (useSyncExternalStore)", () => {
  it("returns the same object reference until a setter publishes", () => {
    clearDraft();
    const a = getDraft();
    const b = getDraft();
    assert.equal(a, b, "Object.is must hold across getDraft calls with no writes");

    for (let i = 0; i < 50; i += 1) {
      assert.equal(getDraft(), a);
    }

    setDraftEmotion("calm");
    const c = getDraft();
    assert.notEqual(c, a);
    assert.equal(getDraft(), c);
  });

  it("does not notify when a setter is a no-op", () => {
    clearDraft();
    let notifies = 0;
    const stop = subscribeDraft(() => {
      notifies += 1;
    });
    setDraftEmotion("calm");
    setDraftSong("soft-tide");
    assert.equal(notifies, 2);
    setDraftEmotion("calm");
    setDraftSong("soft-tide");
    setDraftTopic(null);
    assert.equal(notifies, 2);
    stop();
  });

  /**
   * Stand-in for React's useSyncExternalStore on the Ripple tab
   * (`ComposeRipple` → `useDraft()`). If getSnapshot returns a new object
   * every read, mounting the tab loops into Maximum update depth exceeded.
   */
  it("Ripple-tab useDraft snapshot stays stable across repeated reads", () => {
    clearDraft();
    let renders = 0;
    let snapshot = getDraft();
    const stop = subscribeDraft(() => {
      const next = getDraft();
      // React only re-renders when Object.is fails.
      if (!Object.is(next, snapshot)) {
        snapshot = next;
        renders += 1;
        if (renders > 20) throw new Error("Maximum update depth exceeded");
      }
    });
    // Simulate tapping the Ripple tab: many getSnapshot reads, no writes.
    for (let i = 0; i < 100; i += 1) {
      const next = getDraft();
      if (!Object.is(next, snapshot)) {
        snapshot = next;
        renders += 1;
        if (renders > 20) throw new Error("Maximum update depth exceeded");
      }
    }
    assert.equal(renders, 0);
    setDraftEmotion("hope");
    assert.ok(renders <= 1);
    stop();
  });
});

describe("draft preset-only Feeling and Topic", () => {
  it("rejects free-text values that are not preset ids", () => {
    clearDraft();
    setDraftEmotion("hopeful");
    assert.equal(getDraft().emotion, null);
    setDraftEmotion("tired");
    assert.equal(getDraft().emotion, "tired");
    setDraftTopic("my custom beach day");
    assert.equal(getDraft().topic, null);
    setDraftTopic("beach");
    assert.equal(getDraft().topic, "beach");
  });
});
