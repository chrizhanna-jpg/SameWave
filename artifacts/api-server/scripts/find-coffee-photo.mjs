import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
config({ path: path.join(apiRoot, ".env") });

const imgPath =
  process.argv[2] ??
  "C:/Users/chriz/.cursor/projects/c-Global-Unity-Match/assets/c__Users_chriz_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_coffe_cups_grrrr-7fbd8fc3-9671-4111-a0fd-fc45e40be593.png";

const refBuf = fs.readFileSync(imgPath);
const refB64 = refBuf.toString("base64");
const refPrefix = crypto.createHash("md5").update(refB64.slice(0, 4096)).digest("hex");
const refFull = crypto.createHash("md5").update(refB64).digest("hex");
console.log("Reference prefix hash:", refPrefix);
console.log("Reference full b64 hash:", refFull, "len", refB64.length);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows } = await client.query(`
  SELECT p.id, p.theme, p.tags, p.subjects, p.mime_type,
    md5(p.bytes_base64) AS full_hash,
    md5(substring(p.bytes_base64 from 1 for 4096)) AS prefix_hash,
    length(p.bytes_base64) AS b64_len,
    COALESCE(s.seen_cnt, 0)::int AS seen_cnt,
    COALESCE(v.same_cnt, 0)::int AS same_cnt
  FROM photos p
  LEFT JOIN (
    SELECT photo_id, COUNT(*) AS seen_cnt FROM seen_photos GROUP BY photo_id
  ) s ON s.photo_id = p.id
  LEFT JOIN (
    SELECT photo_id, COUNT(*) FILTER (WHERE verdict = 'same') AS same_cnt
    FROM votes GROUP BY photo_id
  ) v ON v.photo_id = p.id
  WHERE p.status = 'active'
`);

let prefixHits = [];
let fullHits = [];
for (const r of rows) {
  if (r.prefix_hash === refPrefix) prefixHits.push(r);
  if (r.full_hash === refFull) fullHits.push(r);
}
console.log("\nPrefix hash matches:", prefixHits.length);
prefixHits.forEach((r) => console.log(r.id, r.theme, r.seen_cnt, r.same_cnt, r.b64_len));

console.log("\nFull hash matches:", fullHits.length);
fullHits.forEach((r) => console.log(r));

// Coffee / cup keyword rows sorted by exposure
const coffee = rows
  .filter((r) => {
    const hay = [r.theme, ...(r.tags ?? []), ...(r.subjects ?? [])]
      .join(" ")
      .toLowerCase();
    return /\b(coffee|latte|espresso|cappuccino|tea cup|ceramic mug|mug|three cup)\b/.test(
      hay,
    );
  })
  .sort((a, b) => b.seen_cnt + b.same_cnt * 2 - (a.seen_cnt + a.same_cnt * 2));

console.log("\nCoffee-keyword photos by exposure:", coffee.length);
for (const c of coffee.slice(0, 12)) {
  console.log(
    c.id,
    c.theme,
    "seen",
    c.seen_cnt,
    "same",
    c.same_cnt,
    "prefix",
    c.prefix_hash?.slice(0, 10),
    "len",
    c.b64_len,
    JSON.stringify(c.tags),
    JSON.stringify(c.subjects),
  );
}

// Photos with empty theme but high exposure (mislabeled viral candidates)
const emptyTheme = rows
  .filter((r) => !r.theme || r.theme.trim() === "")
  .sort((a, b) => b.seen_cnt - a.seen_cnt);
console.log("\nEmpty-theme photos:", emptyTheme.length);
for (const e of emptyTheme.slice(0, 5)) console.log(e.id, e.seen_cnt, e.b64_len);

await client.end();
