/**
 * Smoke tests for interpretive theme matching (server mirror).
 * Run: node ./scripts/test-theme-match.mjs
 */
import {
  resolveChallengeThemeId,
  normalizeChallengeTheme,
  themeExactMatchVariants,
} from "../src/lib/challengeTheme.js";

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  }
}

assert(resolveChallengeThemeId("Your hands") === "hands", "Your hands → hands");
assert(resolveChallengeThemeId("your hands") === "hands", "your hands → hands");
assert(resolveChallengeThemeId("handwriting") === "handwriting", "handwriting id");
assert(normalizeChallengeTheme("Your hands") === "hands", "normalize");

const variants = themeExactMatchVariants("hands");
assert(variants.includes("hands"), "variant includes id");
assert(variants.includes("your hands"), "variant includes your hands");

if (process.exitCode) {
  console.error("Some checks failed");
} else {
  console.log("OK — theme match smoke tests passed");
}
