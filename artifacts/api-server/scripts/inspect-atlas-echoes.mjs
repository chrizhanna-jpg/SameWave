import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env") });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query(`
  SELECT e.id::text, e.state, e.theme,
    upper(trim(coalesce(nullif(trim(pl.country_code), ''), u_pl.country_code))) AS lc,
    upper(trim(coalesce(nullif(trim(ph.country_code), ''), u_ph.country_code))) AS hc,
    pl.id::text AS pl_id, ph.id::text AS ph_id
  FROM echoes e
  JOIN photos pl ON pl.id = e.photo_low_id
  JOIN photos ph ON ph.id = e.photo_high_id
  JOIN users u_pl ON u_pl.id = pl.user_id
  JOIN users u_ph ON u_ph.id = ph.user_id
  WHERE e.state IN ('pending', 'mutual')
  ORDER BY e.created_at DESC
  LIMIT 30
`);
console.log(JSON.stringify(rows, null, 2));
await client.end();
