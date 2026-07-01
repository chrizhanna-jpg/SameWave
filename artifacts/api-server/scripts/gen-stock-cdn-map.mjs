/**
 * Generates src/data/stock-photo-cdn.json from stock-pool-manifest.mjs.
 * Run before api-server build so /candidates can return Unsplash CDN URIs
 * for stock_pool_v1_* rows (instant load on mobile vs authed API stream).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStockPoolManifest } from "./stock-pool-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../src/data");
const outPath = path.join(outDir, "stock-photo-cdn.json");

const manifest = buildStockPoolManifest();
const stockPoolV1 = manifest.map((row) => row.unsplashId);

// Replacement coffee stock (replace-viral-coffee-photo.mjs) — same order as insert.
const stockCoffeeV2 = [
  "1495474472287-4d71bcdd2085",
  "1509042239860-f550ce710b93",
  "1497935586351-b67a49e012bf",
  "1542990253-0d0f5be5f0ed",
  "1497636577773-f1231844b336",
  "1466637574441-749b8f19452f",
  "1541167760496-1628856ab772",
  "1521017432531-fbd92d768814",
  "1494314671902-399b18174975",
  "1554118811-1e0d58224f24",
];

mkdirSync(outDir, { recursive: true });
writeFileSync(
  outPath,
  JSON.stringify({ stockPoolV1, stockCoffeeV2 }, null, 0),
  "utf8",
);
console.log(
  `Wrote ${outPath} (${stockPoolV1.length} pool_v1 + ${stockCoffeeV2.length} coffee_v2)`,
);
