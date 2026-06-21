/**
 * Ripplefire must bucket by daily theme — sky and nature stay separate even with shared tags.
 * Run: node ./scripts/test-ripplefire-theme-anchor.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Minimal inline mirror of theme ids used in the test (avoid Expo @/ paths in node).
const SKY = "Your sky";
const NATURE = "Nature near you";

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  }
}

const src = readFileSync(path.join(here, "../utils/atlasWavefire.ts"), "utf8");
assert(
  src.includes("detectThemeAnchoredRippleClusters"),
  "theme-anchored ripple clustering present",
);
assert(
  src.includes("Ripplefire rings anchor on one daily-challenge theme"),
  "ripple clustering documents theme anchor",
);
assert(
  !src.includes("detectAtlasThemeClusters(\n    connections,\n    windowMs,\n    minEvents,\n    minCountries,\n    \"ripple\",\n  )"),
  "ripplefire no longer uses tag-linked wave clustering",
);

const apiSrc = readFileSync(path.join(here, "../utils/api.ts"), "utf8");
assert(
  apiSrc.includes("(m.theme ?? m.theirActualTheme"),
  "explore prefers voter challenge theme over counterparty label",
);

const atlasLocal = readFileSync(path.join(here, "../utils/atlasLocalRipples.ts"), "utf8");
assert(
  atlasLocal.includes("(m.theme ?? m.theirActualTheme"),
  "local ripple arcs prefer voter challenge theme",
);

if (process.exitCode) {
  console.error("Theme anchor checks failed");
} else {
  console.log("OK — ripplefire theme anchor checks passed");
}
