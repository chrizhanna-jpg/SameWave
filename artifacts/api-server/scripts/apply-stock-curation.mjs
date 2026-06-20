/**
 * Update stock_pool_v1_* label columns from stock-pool-curation.mjs (no re-download).
 *
 *   node ./scripts/apply-stock-curation.mjs           # dry-run
 *   node ./scripts/apply-stock-curation.mjs --apply
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { buildStockPoolManifest } from "./stock-pool-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
config({ path: path.join(apiRoot, ".env") });

const apply = process.argv.includes("--apply");
const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const PREFIX = "stock_pool_v1";
const manifest = buildStockPoolManifest();

function pad(n, width = 4) {
  return String(n).padStart(width, "0");
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  const { rows: existing } = await client.query(
    `SELECT id FROM photos WHERE id LIKE $1 AND status = 'active' ORDER BY id`,
    [`${PREFIX}_p_%`],
  );

  if (existing.length !== manifest.length) {
    console.warn(
      `Row count mismatch: DB has ${existing.length}, manifest has ${manifest.length}. Proceeding with min length.`,
    );
  }

  const count = Math.min(existing.length, manifest.length);
  let changed = 0;

  for (let i = 0; i < count; i++) {
    const id = `${PREFIX}_p_${pad(i + 1)}`;
    const m = manifest[i];
    const shapes = m.shapes ?? [];

    if (!apply) {
      if (i < 3) {
        console.log(
          `  ${id} theme=${m.theme} tags=[${m.tags.join(",")}] subjects=[${m.subjects.join(",")}]`,
        );
      }
      continue;
    }

    const res = await client.query(
      `UPDATE photos
       SET theme = $1, tags = $2::text[], subjects = $3::text[], shape_tags = $4::text[]
       WHERE id = $5 AND status = 'active'`,
      [m.theme, m.tags, m.subjects, shapes, id],
    );
    if (res.rowCount) changed++;
    if ((i + 1) % 50 === 0 || i + 1 === count) {
      console.log(`  updated ${i + 1}/${count}`);
    }
  }

  if (apply) {
    console.log(`\nApplied curated labels to ${changed} stock pool rows.`);
  } else {
    console.log(`\nDry run OK (${count} rows). Re-run with --apply to update production.`);
  }
} finally {
  await client.end();
}
