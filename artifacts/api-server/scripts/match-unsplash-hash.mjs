import crypto from "node:crypto";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env") });

const ids = [
  "1559056199-641a0ac8b55e",
  "1495474472287-4d71bcdd2085",
  "1509042239860-f550ce710b93",
];

for (const id of ids) {
  const res = await fetch(`https://images.unsplash.com/photo-${id}?w=400`);
  const buf = Buffer.from(await res.arrayBuffer());
  const b64 = buf.toString("base64");
  const hash = crypto.createHash("md5").update(b64.slice(0, 4096)).digest("hex");
  console.log(id, "hash", hash, "b64len", b64.length);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query(`
  SELECT id, theme, tags, md5(substring(bytes_base64 from 1 for 4096)) AS h
  FROM photos WHERE status = 'active'
`);
const target = crypto.createHash("md5");
const res = await fetch(
  "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400",
);
const buf = Buffer.from(await res.arrayBuffer());
const targetHash = crypto.createHash("md5").update(buf.toString("base64").slice(0, 4096)).digest("hex");
console.log("\nTarget hash:", targetHash);
const hits = rows.filter((r) => r.h === targetHash);
console.log("DB hits:", hits.length);
for (const h of hits) console.log(h);

// fuzzy: same hash at w=800?
const res8 = await fetch(
  "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=800",
);
const buf8 = Buffer.from(await res8.arrayBuffer());
const hash8 = crypto
  .createHash("md5")
  .update(buf8.toString("base64").slice(0, 4096))
  .digest("hex");
console.log("\nTarget w=800 hash:", hash8);
const hits8 = rows.filter((r) => r.h === hash8);
console.log("DB hits w800:", hits8.length);
for (const h of hits8) console.log(h);

await client.end();
