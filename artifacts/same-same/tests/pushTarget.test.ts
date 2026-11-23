import assert from "node:assert/strict";
import { test } from "node:test";

import { targetFromNotificationData } from "../core/pushTarget";

test("mutual Wave payload with waveId routes to that Wave with reveal", () => {
  const target = targetFromNotificationData({
    waveId: "wave-123",
    echoId: "wave-123",
    state: "mutual",
    reveal: "1",
    deepLink: "/wave/wave-123?reveal=1",
  });
  assert.equal(target.waveId, "wave-123");
  assert.equal(target.reveal, true);
  assert.equal(target.photoA, null);
  assert.equal(target.photoB, null);
});

test("echoId alone is accepted as waveId", () => {
  const target = targetFromNotificationData({ echoId: "echo-9", state: "mutual" });
  assert.equal(target.waveId, "echo-9");
  assert.equal(target.reveal, true);
});

test("pending offer with echoId does not request the Wave reveal", () => {
  const target = targetFromNotificationData({
    echoId: "echo-pending",
    state: "pending",
    deepLink: "/echoes",
  });
  assert.equal(target.waveId, "echo-pending");
  assert.equal(target.reveal, false);
});

test("legacy echo-pair deep link still yields photo ids", () => {
  const target = targetFromNotificationData({
    deepLink: "/echo-pair?a=photo-a&b=photo-b",
    state: "mutual",
  });
  assert.equal(target.photoA, "photo-a");
  assert.equal(target.photoB, "photo-b");
  assert.equal(target.waveId, null);
  assert.equal(target.reveal, true);
});

test("deepLink /wave/:id populates waveId", () => {
  const target = targetFromNotificationData({
    deepLink: "/wave/abc%2Fdef?reveal=1",
  });
  assert.equal(target.waveId, "abc/def");
  assert.equal(target.reveal, true);
});

test("empty / unknown data is inert", () => {
  assert.deepEqual(targetFromNotificationData(null), {
    waveId: null,
    photoA: null,
    photoB: null,
    reveal: false,
  });
  assert.deepEqual(targetFromNotificationData({ hello: "world" }), {
    waveId: null,
    photoA: null,
    photoB: null,
    reveal: false,
  });
});
