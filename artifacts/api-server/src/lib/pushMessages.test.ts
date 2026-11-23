import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildExpoPushMessages,
  deadTokensFromTickets,
  EXPO_WAVE_CHANNEL_ID,
} from "./pushMessages.ts";

test("buildExpoPushMessages keeps only Expo tokens and sets waves channel", () => {
  const messages = buildExpoPushMessages(
    [
      "ExponentPushToken[aaaa]",
      "not-a-token",
      "ExpoPushToken[bbbb]",
      "",
    ],
    {
      title: "Catch a Wave! ✨",
      body: "They rippled back!",
      categoryId: "wave_mutual",
      data: { waveId: "w1", reveal: "1" },
    },
  );
  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.to, "ExponentPushToken[aaaa]");
  assert.equal(messages[1]?.to, "ExpoPushToken[bbbb]");
  for (const m of messages) {
    assert.equal(m.channelId, EXPO_WAVE_CHANNEL_ID);
    assert.equal(m.channelId, "waves");
    assert.equal(m.sound, "default");
    assert.equal(m.title, "Catch a Wave! ✨");
    assert.deepEqual(m.data, { waveId: "w1", reveal: "1" });
    assert.equal(m.categoryId, "wave_mutual");
  }
});

test("buildExpoPushMessages returns empty when no valid tokens", () => {
  assert.deepEqual(buildExpoPushMessages(["fcm:xyz", ""], { title: "t", body: "b" }), []);
});

test("deadTokensFromTickets prunes only DeviceNotRegistered", () => {
  const tokens = ["ExponentPushToken[a]", "ExponentPushToken[b]", "ExponentPushToken[c]"];
  const dead = deadTokensFromTickets(tokens, [
    { status: "ok", id: "1" },
    { status: "error", details: { error: "DeviceNotRegistered" } },
    { status: "error", details: { error: "MessageTooBig" } },
  ]);
  assert.deepEqual(dead, ["ExponentPushToken[b]"]);
});

test("deadTokensFromTickets tolerates short ticket lists", () => {
  assert.deepEqual(deadTokensFromTickets(["ExponentPushToken[a]"], []), []);
});
