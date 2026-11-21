import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clearDraft,
  getDraftTopic,
  isDraftTopicLocked,
  setDraftTopic,
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
