import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const composeSrc = readFileSync(path.join(here, "../components/ComposeRipple.tsx"), "utf8");

test("compose heading is What's the topic? and Upload moment stays", () => {
  assert.match(composeSrc, /What&apos;s the topic\?/);
  assert.doesNotMatch(composeSrc, /What&apos;s the moment\?/);
  assert.match(composeSrc, /Upload moment/);
  assert.match(composeSrc, /missing\.push\("a topic"\)/);
  assert.doesNotMatch(composeSrc, /missing\.push\("a moment"\)/);
});

test("Ripple tab compose no longer mounts RippleRings", () => {
  assert.doesNotMatch(composeSrc, /RippleRings/);
});

test("Home capture button wording unchanged in home.tsx", () => {
  const home = readFileSync(path.join(here, "../app/(tabs)/home.tsx"), "utf8");
  assert.match(home, /Capture a moment/);
});

test("Feeling and Topic open in any order — no gating copy", () => {
  assert.doesNotMatch(composeSrc, /feelingReady/);
  assert.doesNotMatch(composeSrc, /Choose a feeling first/);
  assert.doesNotMatch(composeSrc, /topicWaiting/);
  assert.doesNotMatch(composeSrc, /topicFocusToken/);
  // TopicPicker call site — no disabled prop (Button may still use disabled).
  assert.match(
    composeSrc,
    /<TopicPicker\s+value=\{draft\.topic\}\s+onChange=\{onTopicChange\}\s+locked=\{pickerLocked\}\s+scrollRef=\{scrollRef\}/,
  );
});

test("shared TypeAheadPicker collapses to the selected label only", () => {
  const picker = readFileSync(path.join(here, "../components/TypeAheadPicker.tsx"), "utf8");
  assert.match(picker, /Tap to change/);
  assert.doesNotMatch(picker, />\s*Change\s*</);
  assert.match(picker, /Keyboard\.dismiss/);
  assert.doesNotMatch(picker, /Choose a feeling first/);
});
