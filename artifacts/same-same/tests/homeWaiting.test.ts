import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  homeWaitingCopy,
  shouldShowHomeWaiting,
  shouldShowRippleSentWaiting,
} from "../core/homeWaiting";

const here = path.dirname(fileURLToPath(import.meta.url));

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

test("Home never shows Ripple-sent chrome (that lives on the Ripple tab)", () => {
  assert.equal(
    shouldShowHomeWaiting({
      hasTravellingRipple: true,
      postSendWaiting: true,
      sendingAnother: false,
      rippleOffered: true,
    }),
    false,
  );
});

test("Ripple tab shows Ripple-sent waiting after Match offer", () => {
  assert.equal(
    shouldShowRippleSentWaiting({
      hasTravellingRipple: true,
      postSendWaiting: true,
      rippleOffered: true,
    }),
    true,
  );
  assert.equal(
    shouldShowRippleSentWaiting({
      hasTravellingRipple: true,
      postSendWaiting: true,
      rippleOffered: false,
    }),
    false,
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

test("after offering a Ripple, copy is Ripple-sent confirmation", () => {
  const copy = homeWaitingCopy({ rippleOffered: true });
  assert.equal(copy.title, "Your Ripple is out there");
  assert.equal(copy.caption, "Waves usually arrive within a few days.");
});

test("Ripple tab mounts RippleRings for Ripple-sent waiting", () => {
  const compose = readFileSync(path.join(here, "../components/ComposeRipple.tsx"), "utf8");
  assert.match(compose, /shouldShowRippleSentWaiting/);
  assert.match(compose, /<RippleRings\s+size=\{160\}\s*\/>/);
  assert.match(compose, /Your Ripple is out there/);
  assert.match(compose, /Send another/);
  assert.match(compose, /dismissPostSendWaiting/);
});

test("Match lands on Ripple tab after offering a Ripple", () => {
  const match = readFileSync(path.join(here, "../app/match.tsx"), "utf8");
  assert.match(match, /router\.replace\("\/\(tabs\)\/ripple"\)/);
  assert.match(match, /postSendRippleOffered/);
  assert.match(match, /Offer = send a Ripple — Ripple tab shows/);
});
