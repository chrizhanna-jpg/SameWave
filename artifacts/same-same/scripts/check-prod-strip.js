#!/usr/bin/env node
/**
 * After `expo export`, assert production bundles do not carry sample JPEGs,
 * location-diag / shot UI bodies, or a live UI_SHOTS Clerk bypass.
 *
 * Usage: node scripts/check-prod-strip.js /path/to/export-dir
 */
const fs = require("fs");
const path = require("path");

const exportDir = process.argv[2];
if (!exportDir || !fs.existsSync(exportDir)) {
  console.error("usage: node scripts/check-prod-strip.js <export-dir>");
  process.exit(2);
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(exportDir);
const js = files.filter((f) => f.endsWith(".js"));
const jpg = files.filter((f) => /\.jpe?g$/i.test(f));

const sampleJpgs = jpg.filter((f) =>
  /test-photos|01-mountain|02-coffee|03-forest|08-ocean/i.test(f),
);
const joined = js.map((f) => fs.readFileSync(f, "utf8")).join("\n");

const failures = [];

if (sampleJpgs.length) {
  failures.push(`sample JPEGs present:\n  ${sampleJpgs.join("\n  ")}`);
}

for (const needle of [
  "Match · Offer a Ripple",
  "Match mid-load shot",
  "Waves list shot",
  "Wave similarity sheet shot",
  "show on map",
  "Location diagnostic",
]) {
  // Stub may mention LocationDiag* as null exports — that is fine.
  // Fail only on distinctive UI copy from the real shot/diag panels.
  if (joined.includes(needle)) {
    failures.push(`production JS still contains UI string: ${JSON.stringify(needle)}`);
  }
}

// Clerk bypass must not activate: UiShotSessionProvider body may exist but
// uiShotsBuildEnabled must compile to return!1 in production (even if
// EXPO_PUBLIC_UI_SHOTS=1 was set at export time).
if (/accountId:\s*"ui-shot"/.test(joined) && !/uiShotsBuildEnabled/.test(joined)) {
  failures.push("ui-shot session present without uiShotsBuildEnabled helper reference");
}
if (/uiShotsBuildEnabled=function\(\)\{return!0\}/.test(joined)) {
  failures.push("uiShotsBuildEnabled compiled to return!0 in production export");
}
if (
  /uiShotsBuildEnabled/.test(joined) &&
  !/uiShotsBuildEnabled=function\(\)\{return!1\}/.test(joined)
) {
  failures.push("uiShotsBuildEnabled present but not compile-time false (return!1)");
}

// Shot route chunks should be tiny redirect shells (< 2KB each).
for (const f of js.filter((p) => /-(ripple-mark|match-blur|waves-list|wave-sheet)-shot-/.test(path.basename(p)) || /shot-/.test(path.basename(p)))) {
  const base = path.basename(f);
  if (!/-shot-/.test(base)) continue;
  const size = fs.statSync(f).size;
  if (size > 4096) {
    failures.push(`shot chunk too large (likely not stubbed): ${base} ${size}B`);
  }
}

if (failures.length) {
  console.error("prod-strip FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  `prod-strip OK: ${js.length} js, ${jpg.length} jpg (0 sample), no shot/diag UI copy`,
);
