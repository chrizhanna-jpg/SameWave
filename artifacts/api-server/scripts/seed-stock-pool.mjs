/**
 * Seeds the SameWave stock candidate pool from stock-pool-manifest.mjs.
 * Labels come from hand-curated manifest data (stock-pool-curation.mjs) — no OpenAI.
 *
 *   node ./scripts/seed-stock-pool.mjs           # dry-run
 *   node ./scripts/seed-stock-pool.mjs --apply
 *   node ./scripts/seed-stock-pool.mjs --use-ai --apply   # optional OpenAI (deploy only)
 */
import crypto from "node:crypto";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  buildStockPoolManifest,
  DAILY_THEME_IDS,
  LIFESTYLE_BUCKETS,
} from "./stock-pool-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
config({ path: path.join(apiRoot, ".env") });

const apply = process.argv.includes("--apply");
const useAi = process.argv.includes("--use-ai");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const labelLimit = limitArg ? Number(limitArg.split("=")[1]) : null;

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing — set it in artifacts/api-server/.env");
  process.exit(1);
}

let analyzeStockPhoto;
let mergeStockLabels;
if (useAi) {
  try {
    ({ analyzeStockPhoto, mergeStockLabels } = await import(
      "../dist/stock-label-entry.mjs"
    ));
  } catch {
    console.error(
      "Missing dist/stock-label-entry.mjs — run `node ./build.mjs` first for --use-ai.",
    );
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY?.trim() && !process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim()) {
    console.error("OPENAI_API_KEY missing — drop --use-ai for hand-curated labels.");
    process.exit(1);
  }
}

const PREFIX = "stock_pool_v1";
const BATCH_LOG = 25;
const AI_CONCURRENCY = 3;

async function fetchImageBase64(unsplashId) {
  const url = `https://images.unsplash.com/photo-${unsplashId}?auto=format&fit=crop&w=400&q=80`;
  const res = await fetch(url, {
    headers: { "User-Agent": "SameWave/1.0 (stock seed)" },
  });
  if (!res.ok) throw new Error(`fetch failed ${unsplashId}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5000) {
    throw new Error(`suspiciously small image ${unsplashId} (${buf.length} bytes)`);
  }
  return buf.toString("base64");
}

function fullB64Hash(b64) {
  return crypto.createHash("md5").update(b64).digest("hex");
}

function pad(n, width = 4) {
  return String(n).padStart(width, "0");
}

function manifestFallback(row) {
  return {
    theme: row.theme,
    tags: row.tags,
    subjects: row.subjects,
    shapes: [],
  };
}

async function labelUniqueImages(manifest, bytesByUnsplash) {
  const uniqueIds = [...new Set(manifest.map((r) => r.unsplashId))];
  const toLabel =
    labelLimit != null && Number.isFinite(labelLimit)
      ? uniqueIds.slice(0, labelLimit)
      : uniqueIds;

  console.log(`\nAI labeling ${toLabel.length} unique images (${AI_CONCURRENCY} concurrent)…`);

  /** @type {Map<string, { theme: string, tags: string[], subjects: string[], shapes: string[] }>} */
  const cache = new Map();
  let done = 0;
  let failures = 0;

  async function labelOne(unsplashId) {
    const row = manifest.find((r) => r.unsplashId === unsplashId);
    if (!row) return;
    const bytes = bytesByUnsplash.get(unsplashId);
    if (!bytes) return;
    try {
      const ai = await analyzeStockPhoto({
        base64: bytes,
        mimeType: "image/jpeg",
        expectedTheme: row.theme,
        bucket: row.bucket,
        manifestTags: row.tags,
        manifestSubjects: row.subjects,
      });
      cache.set(
        unsplashId,
        mergeStockLabels(
          {
            theme: row.theme,
            tags: row.tags,
            subjects: row.subjects,
          },
          ai,
        ),
      );
    } catch (err) {
      failures++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  AI FAIL ${unsplashId} (${row.bucket}): ${msg}`);
      cache.set(unsplashId, manifestFallback(row));
    }
    done++;
    if (done % 10 === 0 || done === toLabel.length) {
      console.log(`  labeled ${done}/${toLabel.length}`);
    }
  }

  for (let i = 0; i < toLabel.length; i += AI_CONCURRENCY) {
    const batch = toLabel.slice(i, i + AI_CONCURRENCY);
    await Promise.all(batch.map((id) => labelOne(id)));
  }

  // Unlabeled unique ids (when --limit) fall back to first manifest row
  for (const unsplashId of uniqueIds) {
    if (cache.has(unsplashId)) continue;
    const row = manifest.find((r) => r.unsplashId === unsplashId);
    if (row) cache.set(unsplashId, manifestFallback(row));
  }

  console.log(`  AI cache: ${cache.size} unique labels (${failures} failures used manifest fallback)`);
  return cache;
}

const manifest = buildStockPoolManifest();
console.log(`Manifest rows: ${manifest.length}`);
console.log(`  daily themes: ${DAILY_THEME_IDS.length} × 6 = ${DAILY_THEME_IDS.length * 6}`);
console.log(`  lifestyle buckets: ${Object.keys(LIFESTYLE_BUCKETS).length} × 6 = ${Object.keys(LIFESTYLE_BUCKETS).length * 6}`);

const bucketCounts = {};
for (const row of manifest) {
  const kind = row.bucket.startsWith("daily_") ? "daily" : "lifestyle";
  bucketCounts[kind] = (bucketCounts[kind] ?? 0) + 1;
  bucketCounts[row.bucket] = (bucketCounts[row.bucket] ?? 0) + 1;
}
console.log(`  daily rows: ${bucketCounts.daily ?? 0}`);
console.log(`  lifestyle rows: ${bucketCounts.lifestyle ?? 0}`);

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

const bytesByUnsplash = new Map();

async function getImageBytes(unsplashId) {
  if (bytesByUnsplash.has(unsplashId)) return bytesByUnsplash.get(unsplashId);
  const bytes = await fetchImageBase64(unsplashId);
  bytesByUnsplash.set(unsplashId, bytes);
  return bytes;
}

const payloads = [];
const fetchFailures = [];

try {
  console.log("\nDownloading images…");
  for (let i = 0; i < manifest.length; i++) {
    const row = manifest[i];
    const seq = i + 1;
    try {
      const bytes = await getImageBytes(row.unsplashId);
      payloads.push({
        ...row,
        bytes,
        id: `${PREFIX}_p_${pad(seq)}`,
        userId: `${PREFIX}_u_${pad(seq)}`,
        deviceId: `${PREFIX}_d_${pad(seq)}`,
      });
      if (seq % BATCH_LOG === 0 || seq === manifest.length) {
        console.log(`  progress ${seq}/${manifest.length} (${row.bucket})`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fetchFailures.push({ seq, bucket: row.bucket, unsplashId: row.unsplashId, msg });
      console.error(`  FAIL [${seq}] ${row.bucket} ${row.unsplashId}: ${msg}`);
    }
  }

  console.log(`\nPrepared ${payloads.length}/${manifest.length} rows`);
  console.log(`  unique Unsplash downloads: ${bytesByUnsplash.size}`);
  if (fetchFailures.length) {
    console.log(`Fetch failures: ${fetchFailures.length}`);
    for (const f of fetchFailures) {
      console.log(`  #${f.seq} ${f.bucket} ${f.unsplashId}: ${f.msg}`);
    }
    process.exit(1);
  }

  /** @type {Map<string, { theme: string, tags: string[], subjects: string[], shapes: string[] }>} */
  let labelCache = new Map();
  if (useAi) {
    labelCache = await labelUniqueImages(manifest, bytesByUnsplash);
  } else {
    console.log("\nUsing hand-curated manifest labels (no OpenAI).");
    for (const unsplashId of bytesByUnsplash.keys()) {
      const row = manifest.find((r) => r.unsplashId === unsplashId);
      if (row) {
        labelCache.set(unsplashId, {
          theme: row.theme,
          tags: row.tags,
          subjects: row.subjects,
          shapes: row.shapes ?? [],
        });
      }
    }
  }

  for (const p of payloads) {
    const labels = labelCache.get(p.unsplashId) ?? {
      theme: p.theme,
      tags: p.tags,
      subjects: p.subjects,
      shapes: p.shapes ?? [],
    };
    p.theme = labels.theme;
    p.tags = labels.tags;
    p.subjects = labels.subjects;
    p.shapes = labels.shapes;
  }

  if (!apply) {
    const sample = payloads.slice(0, 3);
    console.log("\nSample AI labels:");
    for (const s of sample) {
      console.log(
        `  ${s.id} ${s.bucket}: theme=${s.theme} tags=[${s.tags.join(",")}] subjects=[${s.subjects.join(",")}] shapes=[${(s.shapes ?? []).join(",")}]`,
      );
    }
    console.log("\nDry run OK. Re-run with --apply to replace stock_pool_v1_* rows.");
    process.exit(0);
  }

  await client.query("BEGIN");

  await client.query(`DELETE FROM echoes WHERE photo_low_id LIKE '${PREFIX}_p_%' OR photo_high_id LIKE '${PREFIX}_p_%'`);
  await client.query(`DELETE FROM photos WHERE id LIKE '${PREFIX}_p_%'`);
  await client.query(`DELETE FROM users WHERE id LIKE '${PREFIX}_u_%'`);

  for (let i = 0; i < payloads.length; i++) {
    const p = payloads[i];
    await client.query(
      `INSERT INTO users (id, device_id, auth_id, country_code, is_pro, created_at)
       VALUES ($1, $2, NULL, $3, false, now())
       ON CONFLICT (id) DO NOTHING`,
      [p.userId, p.deviceId, p.cc],
    );
    await client.query(
      `INSERT INTO photos (
         id, user_id, bytes_base64, mime_type, theme, tags, shape_tags, subjects,
         country_code, capture_country_code, music_genre, status, report_count, created_at, expires_at
       ) VALUES (
         $1, $2, $3, 'image/jpeg', $4, $5::text[], $6::text[], $7::text[],
         $8, $8, 'calm', 'active', 0, now(), NULL
       )`,
      [
        p.id,
        p.userId,
        p.bytes,
        p.theme,
        p.tags,
        p.shapes ?? [],
        p.subjects,
        p.cc,
      ],
    );
    if ((i + 1) % BATCH_LOG === 0 || i + 1 === payloads.length) {
      console.log(`  inserted ${i + 1}/${payloads.length}`);
    }
  }

  await client.query("COMMIT");
  console.log(`\nApplied: inserted ${payloads.length} stock pool photos.`);
  console.log(`  unique images: ${labelCache.size}`);
  console.log(`  labeling: ${useAi ? "OpenAI (--use-ai)" : "hand-curated manifest"}`);
  console.log(`  daily: ${bucketCounts.daily ?? 0}`);
  console.log(`  lifestyle: ${bucketCounts.lifestyle ?? 0}`);
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
