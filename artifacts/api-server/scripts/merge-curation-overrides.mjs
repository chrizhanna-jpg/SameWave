/**
 * Merge curation-batches/batch-*-overrides.json into build-stock-curation.mjs OVERRIDES.
 * Run: node scripts/merge-curation-overrides.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BATCH_DIR = path.join(__dirname, "curation-batches");
const BUILD_PATH = path.join(__dirname, "build-stock-curation.mjs");

/** @type {Record<string, { tags: string[], subjects: string[], shapes?: string[] }>} */
const merged = {};
const files = fs
  .readdirSync(BATCH_DIR)
  .filter((f) => f.endsWith("-overrides.json"))
  .sort();
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(BATCH_DIR, f), "utf8"));
  for (const [id, entry] of Object.entries(data)) {
    if (merged[id]) console.warn(`duplicate override for ${id} in ${f}`);
    merged[id] = entry;
  }
}
console.log(`Merged ${Object.keys(merged).length} overrides from ${files.length} batch files`);

let src = fs.readFileSync(BUILD_PATH, "utf8");
const overrideStart = src.indexOf("const OVERRIDES = {");
const overrideEnd = src.indexOf("\n};", overrideStart);
if (overrideStart < 0 || overrideEnd < 0) {
  console.error("Could not find OVERRIDES block");
  process.exit(1);
}

const existingBlock = src.slice(overrideStart, overrideEnd + 3);
const existingIds = new Set(
  [...existingBlock.matchAll(/^\s+"([0-9a-f-]+)":\s*\{/gm)].map((m) => m[1]),
);

let added = 0;
let skipped = 0;
const lines = [];
for (const [id, entry] of Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))) {
  if (existingIds.has(id)) {
    skipped++;
    continue;
  }
  added++;
  lines.push(`  "${id}": {`);
  lines.push(`    tags: ${JSON.stringify(entry.tags)},`);
  lines.push(`    subjects: ${JSON.stringify(entry.subjects)},`);
  if (entry.shapes?.length) {
    lines.push(`    shapes: ${JSON.stringify(entry.shapes)},`);
  }
  lines.push(`  },`);
}

if (!lines.length) {
  console.log("Nothing new to add.");
  process.exit(0);
}

const insert = `\n  // ── Visual curation pass (${new Date().toISOString().slice(0, 10)}) ──\n${lines.join("\n")}`;
const newSrc =
  src.slice(0, overrideEnd) + insert + src.slice(overrideEnd);
fs.writeFileSync(BUILD_PATH, newSrc);
console.log(`Added ${added} new OVERRIDES (${skipped} already existed)`);
