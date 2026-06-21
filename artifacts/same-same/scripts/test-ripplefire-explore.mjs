/**
 * Ripplefire clustering smoke test (no Expo path aliases).
 * Run: node ./scripts/test-ripplefire-explore.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const atlasWavefireSrc = readFileSync(
  path.join(here, "../utils/atlasWavefire.ts"),
  "utf8",
);

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  }
}

assert(
  atlasWavefireSrc.includes("detectRipplefireClusters"),
  "atlasWavefire exports ripplefire clustering",
);
assert(
  atlasWavefireSrc.includes("fireClusterThemesMatch"),
  "clustering uses exact/fuzzy theme match",
);

const apiSrc = readFileSync(path.join(here, "../utils/api.ts"), "utf8");
assert(
  apiSrc.includes("expandExploreConnectionIds"),
  "api expands local ripples for explore",
);

const atlasTsx = readFileSync(
  path.join(here, "../app/(tabs)/atlas.tsx"),
  "utf8",
);
assert(
  atlasTsx.includes("ripplefireClusterConnections"),
  "atlas passes viewer ripples into cluster input",
);

const globeSrc = readFileSync(
  path.join(here, "../components/AtlasGlobeExperience.tsx"),
  "utf8",
);
assert(
  globeSrc.includes("clusterSource"),
  "globe clusters from clusterSource incl. local ripples",
);

if (process.exitCode) {
  console.error("Some ripplefire structure checks failed");
} else {
  console.log("OK — ripplefire structure checks passed");
}
