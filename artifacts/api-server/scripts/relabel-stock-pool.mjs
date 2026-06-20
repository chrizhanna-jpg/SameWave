/**
 * Re-label existing stock_pool_v1_* rows in-place (no re-download / re-insert).
 * Groups by image content hash so duplicate Unsplash reuse gets one label.
 *
 *   node ./build.mjs && node ./scripts/relabel-stock-pool.mjs           # dry-run
 *   node ./scripts/relabel-stock-pool.mjs --apply
 *   node ./scripts/relabel-stock-pool.mjs --apply --limit=20
 */
import crypto from "node:crypto";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { buildStockPoolManifest } from "./stock-pool-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
config({ path: path.join(apiRoot, ".env") });

const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const groupLimit = limitArg ? Number(limitArg.split("=")[1]) : null;

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

let analyzeStockPhoto;
let mergeStockLabels;
try {
  ({ analyzeStockPhoto, mergeStockLabels } = await import(
    "../dist/stock-label-entry.mjs"
  ));
} catch {
  console.error("Run `node ./build.mjs` first.");
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY?.trim() && !process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim()) {
  console.error("OPENAI_API_KEY missing");
  process.exit(1);
}

const PREFIX = "stock_pool_v1";
const manifest = buildStockPoolManifest();
const manifestById = new Map(
  manifest.map((row, i) => [
    `${PREFIX}_p_${String(i + 1).padStart(4, "0")}`,
    row,
  ]),
);

function contentHash(b64) {
  return crypto.createHash("md5").update(b64).digest("hex");
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  const { rows } = await client.query(
    `SELECT id, theme, tags, subjects, shape_tags, bytes_base64
     FROM photos
     WHERE id LIKE $1 AND status = 'active'
     ORDER BY id`,
    [`${PREFIX}_p_%`],
  );

  if (rows.length === 0) {
    console.log("No stock pool rows found.");
    process.exit(0);
  }

  /** @type {Map<string, { repId: string, ids: string[], b64: string, manifestRow: object }>} */
  const groups = new Map();
  for (const row of rows) {
    const hash = contentHash(row.bytes_base64);
    const manifestRow = manifestById.get(row.id);
    if (!groups.has(hash)) {
      groups.set(hash, {
        repId: row.id,
        ids: [],
        b64: row.bytes_base64,
        manifestRow: manifestRow ?? {
          theme: row.theme,
          tags: row.tags ?? [],
          subjects: row.subjects ?? [],
          bucket: "unknown",
        },
      });
    }
    groups.get(hash).ids.push(row.id);
  }

  let groupList = [...groups.values()];
  if (groupLimit != null && Number.isFinite(groupLimit)) {
    groupList = groupList.slice(0, groupLimit);
  }

  console.log(`Relabeling ${groupList.length} unique image groups (${rows.length} DB rows)…`);

  let updated = 0;
  for (const group of groupList) {
    const m = group.manifestRow;
    const ai = await analyzeStockPhoto({
      base64: group.b64,
      mimeType: "image/jpeg",
      expectedTheme: m.theme,
      bucket: m.bucket ?? "unknown",
      manifestTags: m.tags ?? [],
      manifestSubjects: m.subjects ?? [],
    });
    const labels = mergeStockLabels(
      {
        theme: m.theme,
        tags: m.tags ?? [],
        subjects: m.subjects ?? [],
      },
      ai,
    );

    console.log(
      `  ${group.repId} (+${group.ids.length - 1} dupes): theme=${labels.theme} tags=[${labels.tags.join(",")}] subjects=[${labels.subjects.join(",")}]`,
    );

    if (apply) {
      for (const id of group.ids) {
        await client.query(
          `UPDATE photos
           SET theme = $2, tags = $3::text[], subjects = $4::text[], shape_tags = $5::text[]
           WHERE id = $1`,
          [id, labels.theme, labels.tags, labels.subjects, labels.shapes],
        );
        updated++;
      }
    }
  }

  if (!apply) {
    console.log("\nDry run OK. Re-run with --apply to write labels.");
  } else {
    console.log(`\nUpdated ${updated} rows.`);
  }
} finally {
  await client.end();
}
