import assert from "node:assert/strict";
import { test } from "node:test";

import { homeWaitingCopy, shouldShowHomeWaiting } from "../core/homeWaiting";

test("waiting only right after a send while a Ripple is travelling", () => {
  assert.equal(
    shouldShowHomeWaiting({
      hasTravellingRipple: true,
      postSendWaiting: true,
      sendingAnother: false,
    }),
    true,
  );
});

test("normal Home when a Ripple is still travelling but post-send was dismissed", () => {
  assert.equal(
    shouldShowHomeWaiting({
      hasTravellingRipple: true,
      postSendWaiting: false,
      sendingAnother: false,
    }),
    false,
  );
});

test("cold start / re-entry with a travelling Ripple shows send buttons", () => {
  assert.equal(
    shouldShowHomeWaiting({
      hasTravellingRipple: true,
      postSendWaiting: false,
      sendingAnother: false,
    }),
    false,
  );
});

test("Send another hides waiting even while post-send is pending", () => {
  assert.equal(
    shouldShowHomeWaiting({
      hasTravellingRipple: true,
      postSendWaiting: true,
      sendingAnother: true,
    }),
    false,
  );
});

test("no travelling Ripple never shows waiting", () => {
  assert.equal(
    shouldShowHomeWaiting({
      hasTravellingRipple: false,
      postSendWaiting: true,
      sendingAnother: false,
    }),
    false,
  );
});

test("photo-only upload uses arrival waiting copy, not Ripple-sent confirmation", () => {
  const copy = homeWaitingCopy({ rippleOffered: false });
  assert.equal(copy.title, "Ripples and Waves arrive in a few days.");
  assert.match(copy.tagline, /shares your moment/);
  assert.equal(copy.caption, null);
  assert.doesNotMatch(copy.title, /out there/i);
});

test("after offering a Ripple, Home keeps Ripple-sent confirmation", () => {
  const copy = homeWaitingCopy({ rippleOffered: true });
  assert.equal(copy.title, "Your Ripple is out there");
  assert.equal(copy.caption, "Waves usually arrive within a few days.");
});
