#!/usr/bin/env node
/**
 * Read-only matching metrics from existing tables (votes, echoes, seen_photos).
 * No migrations. Point DATABASE_URL at Neon test branch br-ancient-pine-aqwxwgt2
 * only — never production.
 *
 * Usage:
 *   DATABASE_URL=… node artifacts/api-server/scripts/match-metrics.mjs
 */
import pg from "pg";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("Set DATABASE_URL (test branch only).");
  process.exit(1);
}
if (/old-mountain|prod|production/i.test(url) && !process.env.ALLOW_PROD_METRICS) {
  console.error("Refusing production-looking DATABASE_URL without ALLOW_PROD_METRICS=1");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const sameVotes = await client.query(
    `SELECT COUNT(*)::int AS n FROM votes WHERE verdict = 'same'`,
  );
  const differentVotes = await client.query(
    `SELECT COUNT(*)::int AS n FROM votes WHERE verdict = 'different'`,
  );
  const mutual = await client.query(
    `SELECT COUNT(*)::int AS n FROM echoes WHERE state = 'mutual'`,
  );
  const pending = await client.query(
    `SELECT COUNT(*)::int AS n FROM echoes WHERE state = 'pending'`,
  );
  const seen = await client.query(`SELECT COUNT(*)::int AS n FROM seen_photos`);

  const same = sameVotes.rows[0].n;
  const different = differentVotes.rows[0].n;
  const swipes = same + different;
  const mutualN = mutual.rows[0].n;
  const wavesPerSwipe = swipes > 0 ? mutualN / swipes : null;
  const mutualRate = same > 0 ? mutualN / same : null;

  const out = {
    sameVotes: same,
    differentVotes: different,
    swipes,
    mutualWaves: mutualN,
    pendingOffers: pending.rows[0].n,
    seenImpressions: seen.rows[0].n,
    wavesPerSwipe,
    mutualWaveRateAmongSameVotes: mutualRate,
  };
  console.log(JSON.stringify(out, null, 2));
} finally {
  await client.end();
}
