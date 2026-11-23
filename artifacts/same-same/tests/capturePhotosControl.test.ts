import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const capture = readFileSync(path.join(here, "../app/capture.tsx"), "utf8");

test("Capture camera chrome offers a labelled Photos control beside the shutter", () => {
  assert.match(capture, /chooseFromLibrary|useLibrary/);
  assert.match(capture, /accessibilityLabel="Photos"/);
  assert.match(capture, /Photos/);
  assert.match(capture, /photosWell|photosLabel/);
  assert.match(capture, /name="photos"/);
  assert.match(capture, /paddingBottom:\s*insets\.bottom/);
  assert.match(capture, /router\.replace\("\/ripple"\)/);
  // Keep permission-denied fallback too.
  assert.match(capture, /Choose from your photos instead/);
});
