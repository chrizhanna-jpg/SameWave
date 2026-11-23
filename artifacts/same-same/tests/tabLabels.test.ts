import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

test("tab bar titles are Home, Ripple, Waves, Map", () => {
  const layout = readFileSync(path.join(root, "app/(tabs)/_layout.tsx"), "utf8");
  assert.match(layout, /name="home"[^}]*title:\s*"Home"/s);
  assert.match(layout, /name="ripple"[^}]*title:\s*"Ripple"/s);
  assert.match(layout, /name="waves"[^}]*title:\s*"Waves"/s);
  assert.match(layout, /name="map"[^}]*title:\s*"Map"/s);
});

test("TabBar shrinks labels to fit four titles and shows Waves badge", () => {
  const bar = readFileSync(path.join(root, "components/TabBar.tsx"), "utf8");
  assert.match(bar, /adjustsFontSizeToFit/);
  assert.match(bar, /maxFontSizeMultiplier=\{1\.3\}/);
  assert.match(bar, /route\.name === "waves"/);
  assert.match(bar, /withOptionalSampleOffers/);
});
