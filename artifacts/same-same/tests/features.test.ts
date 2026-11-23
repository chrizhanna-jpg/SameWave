import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

test("ComposeRipple gates SoundRecorder behind recordSound feature flag", () => {
  const compose = readFileSync(path.join(root, "components/ComposeRipple.tsx"), "utf8");
  assert.match(compose, /useRecordSoundEnabled|peekFeatures|recordSound/);
  assert.match(compose, /recordSound\s*\?/);
  assert.match(compose, /SoundRecorder/);
  assert.match(compose, /Record a sound – optional/);
});

test("app boots feature flags from /api/public/app-config", () => {
  const features = readFileSync(path.join(root, "core/features.ts"), "utf8");
  assert.match(features, /\/api\/public\/app-config/);
  assert.match(features, /recordSound/);
  assert.match(features, /AsyncStorage/);
  const layout = readFileSync(path.join(root, "app/_layout.tsx"), "utf8");
  assert.match(layout, /bootFeatures/);
});

test("api app-config exposes FEATURE_RECORD_SOUND as features.recordSound", () => {
  const app = readFileSync(
    path.join(root, "../api-server/src/app.ts"),
    "utf8",
  );
  assert.match(app, /FEATURE_RECORD_SOUND/);
  assert.match(app, /recordSound:/);
});
