/** Download missing-override stock images for visual curation QA. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStockPoolManifest } from "./stock-pool-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "curation-review");
const LIST_PATH = path.join(__dirname, "missing-overrides.json");

const src = fs.readFileSync(path.join(__dirname, "build-stock-curation.mjs"), "utf8");
const overrideIds = new Set(
  [...src.matchAll(/^\s+"([0-9a-f-]+)":\s*\{/gm)].map((m) => m[1]),
);
const manifest = buildStockPoolManifest();
const rows = manifest
  .filter((r) => !overrideIds.has(r.unsplashId))
  .map((r) => ({
    id: r.unsplashId,
    bucket: r.bucket,
    theme: r.theme,
    tags: r.tags,
    url: `https://images.unsplash.com/photo-${r.unsplashId}?auto=format&fit=crop&w=400&q=80`,
  }));

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(LIST_PATH, JSON.stringify({ missing: rows.length, rows }, null, 2));

let ok = 0;
let fail = 0;
for (const row of rows) {
  const dest = path.join(OUT_DIR, `${row.id}.jpg`);
  if (fs.existsSync(dest) && fs.statSync(dest).size >= 5000) {
    ok++;
    continue;
  }
  try {
    const res = await fetch(row.url);
    if (!res.ok) throw new Error(String(res.status));
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 5000) throw new Error("too small");
    fs.writeFileSync(dest, buf);
    ok++;
    if (ok % 25 === 0) console.log(`  downloaded ${ok}/${rows.length}`);
  } catch (e) {
    fail++;
    console.warn(`  FAIL ${row.id}: ${e.message}`);
  }
}
console.log(`Done: ${ok} ok, ${fail} fail → ${OUT_DIR}`);
