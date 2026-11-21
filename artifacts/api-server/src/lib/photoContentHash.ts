import { sql, type SQL } from "drizzle-orm";

const ALIASES = ["p", "pl", "ph", "p2", "p3"] as const;
export type PhotoHashAlias = (typeof ALIASES)[number];

/**
 * Dedup hash for a photo row. R2 uploads store `content_prefix_md5` and leave
 * `bytes_base64` null. Legacy and stock rows still hash the first 4 KB of
 * base64 in SQL. Null on both sides stays null so the row is excluded from
 * decks instead of collapsing every empty photo onto one hash.
 */
export function photoContentHashSql(alias: PhotoHashAlias): SQL {
  if (!ALIASES.includes(alias)) {
    throw new Error(`invalid photo alias: ${alias}`);
  }
  const table = sql.raw(alias);
  return sql`COALESCE(NULLIF(btrim(${table}.content_prefix_md5), ''), md5(substring(${table}.bytes_base64 from 1 for 4096)))`;
}
