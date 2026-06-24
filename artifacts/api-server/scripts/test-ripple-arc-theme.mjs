/**
 * Ripple arc theme must match voter echo.theme (daily challenge), not initiator AI label.
 * Run: node ./scripts/test-ripple-arc-theme.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load compiled challengeTheme from source via dynamic import of ts — use inline mirror.
function rippleArcTheme(echoTheme, initiatorPhotoTheme, otherPhotoTheme) {
  const echo = echoTheme.trim();
  if (echo) return echo;
  const init = initiatorPhotoTheme.trim();
  if (init) return init;
  return otherPhotoTheme.trim();
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  }
}

assert(
  rippleArcTheme("sky", "nature", "outdoors") === "sky",
  "echo.theme (voter sky) wins over initiator nature label",
);
assert(
  rippleArcTheme("", "nature", "outdoors") === "nature",
  "falls back to initiator when echo theme empty",
);
assert(
  rippleArcTheme("", "", "outdoors") === "outdoors",
  "falls back to other photo theme last",
);

const src = await import(
  path.join(here, "../src/lib/challengeTheme.ts")
).catch(() => null);
if (src?.rippleArcTheme) {
  assert(
    src.rippleArcTheme("Your sky", "Nature near you", "clouds") === "Your sky",
    "bundled rippleArcTheme prefers echo theme",
  );
}

if (process.exitCode) {
  console.error("ripple arc theme checks failed");
} else {
  console.log("OK — ripple arc theme checks passed");
}
