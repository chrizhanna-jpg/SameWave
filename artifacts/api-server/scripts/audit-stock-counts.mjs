/**
 * Audit stock_pool_v1 counts in DB vs manifest (daily + lifestyle buckets).
 * Usage: node ./scripts/audit-stock-counts.mjs
 */
import { config } from "dotenv";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildStockPoolManifest,
  DAILY_THEME_IDS,
} from "./stock-pool-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env") });

const manifest = buildStockPoolManifest();

function pad(n, w = 4) {
  return String(n).padStart(w, "0");
}

const bucketToIds = {};
for (let i = 0; i < manifest.length; i++) {
  const row = manifest[i];
  const id = `stock_pool_v1_p_${pad(i + 1)}`;
  if (!bucketToIds[row.bucket]) bucketToIds[row.bucket] = [];
  bucketToIds[row.bucket].push({
    id,
    theme: row.theme,
    unsplashId: row.unsplashId,
    subjects: row.subjects,
  });
}

const LIFESTYLE = [
  ["at_home_selfie", "🏠 Selfies at home"],
  ["at_home_food", "🏠 Food and drink"],
  ["at_home_pets", "🏠 Pets"],
  ["at_home_kids", "🏠 Kids playing"],
  ["at_home_gaming", "🏠 TV or gaming setups"],
  ["at_home_projects", "🏠 Home projects"],
  ["at_home_seasonal", "🏠 Seasonal decor"],
  ["at_home_weather_window", "🏠 Weather outside window"],
  ["at_home_relax", "🏠 Relaxation moments"],
  ["at_home_wfh", "🏠 Work-from-home setups"],
  ["holiday_beach", "🌴 Beach scenes"],
  ["holiday_landmarks", "🌴 Landmarks"],
  ["holiday_food", "🌴 Food and drinks"],
  ["holiday_sunset", "🌴 Sunsets and skies"],
  ["holiday_selfie", "🌴 Selfies with background"],
  ["holiday_family", "🌴 Family or group shots"],
  ["holiday_hotel", "🌴 Hotel or villa views"],
  ["holiday_transport", "🌴 Transport moments"],
  ["holiday_adventure", "🌴 Adventure activities"],
  ["holiday_souvenirs", "🌴 Souvenirs and local culture"],
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const total = await client.query(
  `SELECT count(*)::int AS c FROM photos WHERE id LIKE 'stock_pool_v1_p_%' AND status = 'active'`,
);

const ids = manifest.map((_, i) => `stock_pool_v1_p_${pad(i + 1)}`);
const inDb = await client.query(
  "SELECT id, theme, status FROM photos WHERE id = ANY($1::text[])",
  [ids],
);
const idSet = new Map(inDb.rows.map((r) => [r.id, r]));

function bucketPresent(bucket) {
  const rows = bucketToIds[bucket] ?? [];
  const present = rows.filter(
    (r) => idSet.has(r.id) && idSet.get(r.id).status === "active",
  );
  return { rows, present, count: present.length };
}

console.log("=== PRODUCTION DATABASE ===");
console.log(`Active stock_pool_v1 photos: ${total.rows[0].c} / ${manifest.length} expected`);
console.log(`Unique Unsplash images: ${new Set(manifest.map((r) => r.unsplashId)).size} (one photo per bucket row, no cross-bucket reuse)\n`);

console.log("=== DAILY THEMES (6 unique photos each) ===");
let dailyOk = 0;
for (const t of DAILY_THEME_IDS) {
  const { count } = bucketPresent(`daily_${t}`);
  const ok = count === 6;
  if (ok) dailyOk++;
  console.log(`${ok ? "✓" : "✗"} ${t.padEnd(16)} ${count}/6`);
}
console.log(`Daily themes at 6/6: ${dailyOk}/${DAILY_THEME_IDS.length}\n`);

console.log("=== AT HOME + ON HOLIDAYS (6 unique photos each) ===");
let lifeOk = 0;
for (const [key, label] of LIFESTYLE) {
  const { rows, count } = bucketPresent(key);
  const ok = count === 6;
  if (ok) lifeOk++;
  const themes = [...new Set(rows.map((r) => r.theme))].join(", ");
  console.log(`${ok ? "✓" : "✗"} ${label.padEnd(36)} ${count}/6  (theme: ${themes})`);
}
console.log(`Lifestyle buckets at 6/6: ${lifeOk}/${LIFESTYLE.length}\n`);

const pets = bucketPresent("at_home_pets");
console.log("=== at_home_pets subject lines ===");
for (const r of pets.present) {
  console.log(`  ${r.id}: ${r.subjects.join(", ")}`);
}

const hands = bucketPresent("daily_hands");
console.log("\n=== daily_hands subject lines ===");
for (const r of hands.present) {
  console.log(`  ${r.id}: ${r.subjects.join(", ")}`);
}

await client.end();
