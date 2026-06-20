import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStockPoolManifest } from "./stock-pool-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, "build-stock-curation.mjs"), "utf8");
const overrideIds = new Set(
  [...src.matchAll(/^\s+"([0-9a-f-]+)":\s*\{/gm)].map((m) => m[1]),
);
const manifest = buildStockPoolManifest();
const missing = manifest.filter((r) => !overrideIds.has(r.unsplashId));
const rows = missing.map((r) => ({
  id: r.unsplashId,
  bucket: r.bucket,
  theme: r.theme,
  tags: r.tags,
  url: `https://images.unsplash.com/photo-${r.unsplashId}?auto=format&fit=crop&w=400&q=80`,
}));
console.log(JSON.stringify({ total: manifest.length, overrides: overrideIds.size, missing: rows.length, rows }, null, 2));
