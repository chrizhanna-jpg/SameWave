/**
 * Audits active photos for theme/subject mismatches (e.g. coffee cups labeled
 * "shoes"), fixes obvious rows, and hides duplicate content hashes.
 *
 * Usage (from artifacts/api-server, loads ./.env):
 *   node ./scripts/audit-fix-photo-themes.mjs           # dry-run report
 *   node ./scripts/audit-fix-photo-themes.mjs --apply   # write fixes
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
config({ path: path.join(apiRoot, ".env") });

const apply = process.argv.includes("--apply");
const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing — set it in artifacts/api-server/.env");
  process.exit(1);
}

const DRINK_RE =
  /\b(coffee|tea|cup|cups|mug|mugs|latte|espresso|cappuccino|beverage|drink|drinks|ceramic)\b/i;
const FOOTWEAR_RE =
  /\b(shoe|shoes|sneaker|sneakers|boot|boots|foot|feet|sandal|sandals|heel|heels|footwear|trainer|trainers)\b/i;

const DRINK_THEMES = new Set([
  "morning",
  "coffee",
  "cafe",
  "food",
  "tea",
  "drink",
  "drinks",
]);
const FOOTWEAR_THEMES = new Set(["shoes", "shoe", "footwear", "sneakers"]);

function haystack(row) {
  const parts = [
    row.theme ?? "",
    ...(row.tags ?? []),
    ...(row.subjects ?? []),
  ];
  return parts.join(" ").toLowerCase();
}

function hasDrinkSignal(row) {
  return DRINK_RE.test(haystack(row));
}

function hasFootwearSignal(row) {
  return FOOTWEAR_RE.test(haystack(row));
}

function suggestTheme(row) {
  const theme = (row.theme ?? "").trim().toLowerCase();
  const drink = hasDrinkSignal(row);
  const footwear = hasFootwearSignal(row);

  if (drink && !footwear) {
    if (DRINK_THEMES.has(theme) && theme !== "shoes") return null;
    return "coffee";
  }
  if (footwear && !drink) {
    if (FOOTWEAR_THEMES.has(theme) || theme === "movement" || theme === "wearing")
      return null;
    return "shoes";
  }
  if (drink && footwear) return null; // ambiguous — skip
  return null;
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  const { rows } = await client.query(`
    SELECT
      p.id,
      p.theme,
      p.tags,
      p.subjects,
      md5(substring(p.bytes_base64 from 1 for 4096)) AS content_hash,
      COALESCE(v.same_cnt, 0)::int AS same_votes,
      COALESCE(s.seen_cnt, 0)::int AS seen_cnt
    FROM photos p
    LEFT JOIN (
      SELECT photo_id, COUNT(*) FILTER (WHERE verdict = 'same') AS same_cnt
      FROM votes GROUP BY photo_id
    ) v ON v.photo_id = p.id
    LEFT JOIN (
      SELECT photo_id, COUNT(*) AS seen_cnt FROM seen_photos GROUP BY photo_id
    ) s ON s.photo_id = p.id
    WHERE p.status = 'active'
    ORDER BY COALESCE(s.seen_cnt, 0) DESC, COALESCE(v.same_cnt, 0) DESC
  `);

  const fixes = [];
  for (const row of rows) {
    const next = suggestTheme(row);
    if (next && next !== (row.theme ?? "").toLowerCase()) {
      fixes.push({
        id: row.id,
        from: row.theme,
        to: next,
        seen: row.seen_cnt,
        same: row.same_votes,
        subjects: row.subjects,
        tags: row.tags,
      });
    }
  }

  console.log(`Active photos: ${rows.length}`);
  console.log(`Theme mismatches to fix: ${fixes.length}`);
  for (const f of fixes.slice(0, 40)) {
    console.log(
      `  ${f.id}: "${f.from}" → "${f.to}" (seen=${f.seen}, same=${f.same}) tags=${JSON.stringify(f.tags)} subjects=${JSON.stringify(f.subjects)}`,
    );
  }
  if (fixes.length > 40) console.log(`  … and ${fixes.length - 40} more`);

  // Duplicate content hashes — keep the row with lowest exposure, hide others.
  const byHash = new Map();
  for (const row of rows) {
    const h = row.content_hash;
    if (!h) continue;
    if (!byHash.has(h)) byHash.set(h, []);
    byHash.get(h).push(row);
  }
  const hideDupes = [];
  for (const [, group] of byHash) {
    if (group.length < 2) continue;
    group.sort(
      (a, b) =>
        a.seen_cnt + a.same_votes * 2 - (b.seen_cnt + b.same_votes * 2),
    );
    const keep = group[0];
    for (let i = 1; i < group.length; i++) {
      const dup = group[i];
      // Atlas global demo intentionally reuses the app icon per country.
      if (
        String(dup.id).startsWith("atlas_global_seed_") ||
        String(keep.id).startsWith("atlas_global_seed_")
      ) {
        continue;
      }
      hideDupes.push({ id: dup.id, hash: group[0].content_hash, keep: keep.id });
    }
  }
  console.log(`Duplicate content hashes (would hide ${hideDupes.length} rows):`);
  for (const h of hideDupes.slice(0, 20)) {
    console.log(`  hide ${h.id} (dup of ${h.keep}, hash ${h.hash.slice(0, 8)}…)`);
  }
  if (hideDupes.length > 20) console.log(`  … and ${hideDupes.length - 20} more`);

  const hot = rows
    .filter((r) => r.seen_cnt >= 25 || r.same_votes >= 8)
    .slice(0, 15);
  console.log("Highest exposure (for manual review):");
  for (const r of hot) {
    console.log(
      `  ${r.id} theme="${r.theme}" seen=${r.seen_cnt} same=${r.same_votes} subjects=${JSON.stringify(r.subjects)}`,
    );
  }

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to write changes.");
    process.exit(0);
  }

  await client.query("BEGIN");
  let themeUpdated = 0;
  for (const f of fixes) {
    await client.query(`UPDATE photos SET theme = $1 WHERE id = $2`, [f.to, f.id]);
    themeUpdated++;
  }
  let hidden = 0;
  for (const h of hideDupes) {
    await client.query(
      `UPDATE photos SET status = 'hidden' WHERE id = $1 AND status = 'active'`,
      [h.id],
    );
    hidden++;
  }
  await client.query("COMMIT");
  console.log(`\nApplied: ${themeUpdated} theme fixes, ${hidden} duplicates hidden.`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(err);
  process.exit(1);
} finally {
  await client.end();
}
