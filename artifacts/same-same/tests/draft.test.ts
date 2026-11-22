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
   * Stand-in for React's useSyncExternalStore: if getSnapshot returns a new
   * object every read, a subscriber that always "updates" would loop forever.
   */
  it("subscriber loop detector stays bounded with stable snapshots", () => {
    clearDraft();
    let renders = 0;
    let snapshot = getDraft();
    const stop = subscribeDraft(() => {
      const next = getDraft();
      // React only re-renders when Object.is fails.
      if (!Object.is(next, snapshot)) {
        snapshot = next;
        renders += 1;
        if (renders > 20) throw new Error("update depth exceeded");
      }
    });
    // Poll getSnapshot the way a mounted ComposeRipple would on each render.
    for (let i = 0; i < 100; i += 1) {
      const next = getDraft();
      if (!Object.is(next, snapshot)) {
        snapshot = next;
        renders += 1;
      }
    }
    assert.equal(renders, 0);
    setDraftEmotion("hopeful");
    assert.ok(renders <= 1);
    stop();
  });
});
