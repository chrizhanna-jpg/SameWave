/**
 * Ripple tab play focus: theme and interests from the Home play buttons.
 * Run: pnpm exec tsx scripts/test-ripple-play-focus.ts
 */
import assert from "node:assert/strict";

import {
  getRipplePlayFocus,
  resetRipplePlayFocusForTests,
  resolveRipplePlayPresentation,
  setRipplePlayFocus,
  subscribeRipplePlayFocus,
} from "../utils/ripplePlayFocus";

resetRipplePlayFocusForTests();

const hidden = resolveRipplePlayPresentation({
  focus: null,
  myVibe: ["coffee"],
});
assert.equal(hidden, null);

const theme = resolveRipplePlayPresentation({
  focus: { kind: "challenge", title: "Morning light", emoji: "🌅" },
  myVibe: [],
});
assert.deepEqual(theme, {
  kind: "challenge",
  title: "Morning light",
  emoji: "🌅",
});

const fromPress = resolveRipplePlayPresentation({
  focus: { kind: "interests", tags: [] },
  myVibe: ["coffee", "music"],
});
assert.deepEqual(fromPress, { kind: "interests", tags: ["coffee", "music"] });

const fromPosted = resolveRipplePlayPresentation({
  focus: { kind: "interests", tags: ["hiking", "cooking"] },
  myVibe: ["coffee"],
  photoTheme: "passions",
  photoTags: ["hiking"],
});
assert.deepEqual(fromPosted, { kind: "interests", tags: ["hiking", "cooking"] });

const fromPhoto = resolveRipplePlayPresentation({
  focus: { kind: "interests" },
  myVibe: [],
  photoTheme: "passions",
  photoTags: ["art", "art", " travel "],
});
assert.deepEqual(fromPhoto, { kind: "interests", tags: ["art", "travel"] });

const stillEmpty = resolveRipplePlayPresentation({
  focus: { kind: "interests", tags: [] },
  myVibe: [],
  photoTheme: "morning",
  photoTags: ["coffee"],
});
assert.equal(stillEmpty, null);

let seen: string[] | undefined;
const stop = subscribeRipplePlayFocus((focus) => {
  seen = focus?.tags;
});
setRipplePlayFocus({ kind: "interests", tags: ["yoga"] });
assert.deepEqual(getRipplePlayFocus()?.tags, ["yoga"]);
assert.deepEqual(seen, ["yoga"]);
stop();
setRipplePlayFocus(null);
assert.equal(getRipplePlayFocus(), null);
assert.deepEqual(seen, ["yoga"]);

console.log("PASS ripple play focus");
