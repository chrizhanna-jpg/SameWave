/**
 * Assign 6 unique Unsplash ids per stock bucket (372 total).
 * Merges existing POOLS + verified-new-ids.json, writes stock-pool-assignments.json.
 *
 *   node scripts/assign-bucket-photos.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildStockPoolManifest,
  DAILY_THEME_IDS,
  LIFESTYLE_BUCKETS,
} from "./stock-pool-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BANNED = new Set([
  "1554118811-1e0d58224f24",
  "1559056199-641a0ac8b55e",
]);

function extractIds(text) {
  return [...text.matchAll(/\b(\d{10,13}-[a-f0-9]{12})\b/g)].map((m) => m[1]);
}

/** @type {Record<string, string[]>} */
const POOLS = {};
const manifestSrc = fs.readFileSync(
  path.join(__dirname, "stock-pool-manifest.mjs"),
  "utf8",
);
const poolMatch = manifestSrc.match(/const POOLS = \{[\s\S]*?\n\};/);
if (!poolMatch) throw new Error("Could not parse POOLS from manifest");
const fn = new Function(`${poolMatch[0]}; return POOLS;`);
Object.assign(POOLS, fn());

const newIdsPath = path.join(__dirname, "verified-new-ids.json");
const newData = fs.existsSync(newIdsPath)
  ? JSON.parse(fs.readFileSync(newIdsPath, "utf8"))
  : { allVerifiedIds: [] };
const newIds = newData.allVerifiedIds ?? newData.ids ?? [];
const byCategory = newData.byCategory ?? newData.byQuery ?? {};
const fromCategories = Object.values(byCategory).flat();

const sampleTs = fs.readFileSync(
  path.resolve(__dirname, "../../same-same/data/samplePhotos.ts"),
  "utf8",
);

const ALL = [
  ...new Set([
    ...Object.values(POOLS).flat(),
    ...newIds,
    ...fromCategories,
    ...extractIds(sampleTs),
  ].map((id) => id.trim()).filter((id) => id && !BANNED.has(id))),
];

const dailyPoolMap = {
  morning: "morning", coffee: "coffee", hands: "hands", sky: "sky", shoes: "shoes",
  food: "food", instrument: "instrument", view: "view", movement: "movement",
  pets: "pets_mixed", reading: "reading", commute: "commute", listening: "listening",
  plant: "plant", work: "work", wearing: "wearing", made: "made", night: "night",
  water: "water", joy: "joy", door: "door", wheels: "wheels", ritual: "ritual",
  nature: "nature", playing: "playing", groceries: "groceries", wall: "wall",
  handwriting: "handwriting", weather: "weather", smallthing: "smallthing",
  furniture: "furniture", games: "games", hobbies: "hobbies", passions: "passions",
  birds: "birds", plants: "plants", music: "music", selfie: "selfie",
  shopping: "shopping", cafe: "cafe", objects: "objects", chores: "chores",
};

/** @type {{ bucket: string, poolKey: string }[]} */
const buckets = [];
for (const theme of DAILY_THEME_IDS) {
  buckets.push({ bucket: `daily_${theme}`, poolKey: dailyPoolMap[theme] ?? theme });
}
for (const [key, def] of Object.entries(LIFESTYLE_BUCKETS)) {
  buckets.push({ bucket: key, poolKey: def.pool });
}

/** Category hints from discovery for preferring theme-fit ids */

const used = new Set();
/** @type {Record<string, string[]>} */
const assignments = {};

function pick(poolKey, want) {
  const prefFromPool = (POOLS[poolKey] ?? []).filter((id) => !BANNED.has(id));
  const prefFromDiscovery = (byCategory[poolKey] ?? []).filter(
    (id) => !BANNED.has(id) && ALL.includes(id),
  );
  const pref = [...new Set([...prefFromPool, ...prefFromDiscovery])];
  const rest = ALL.filter((id) => !pref.includes(id));
  const out = [];
  for (const id of [...pref, ...rest]) {
    if (used.has(id)) continue;
    used.add(id);
    out.push(id);
    if (out.length >= want) break;
  }
  return out;
}

for (const { bucket, poolKey } of buckets) {
  assignments[bucket] = pick(poolKey, 6);
}

const need = buckets.length * 6;
const got = Object.values(assignments).flat().length;
const short = Object.entries(assignments).filter(([, ids]) => ids.length < 6);

console.log({
  masterPool: ALL.length,
  newVerified: newIds.length,
  buckets: buckets.length,
  need,
  assigned: got,
  unique: used.size,
  shortBuckets: short.length,
});

if (short.length) {
  console.error("ERROR: not enough unique ids for full 372 assignment");
  console.error(short.map(([b, ids]) => `${b}: ${ids.length}/6`).join("\n"));
  process.exit(1);
}

const outPath = path.join(__dirname, "stock-pool-assignments.json");
fs.writeFileSync(outPath, JSON.stringify(assignments, null, 2), "utf8");
console.log("Wrote", outPath);

// Sanity: no duplicate ids across buckets
const flat = Object.values(assignments).flat();
if (new Set(flat).size !== flat.length) {
  console.error("Duplicate ids in assignments!");
  process.exit(1);
}
