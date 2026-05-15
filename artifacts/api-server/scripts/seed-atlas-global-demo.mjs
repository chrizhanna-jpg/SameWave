/**
 * Inserts **global server-only** demo rows so `GET /api/photos/atlas` returns
 * country counts + live ripple/wave arcs (same queries the Expo Atlas tab uses).
 *
 * Idempotent: removes prior rows whose ids start with `atlas_global_seed_`.
 *
 * Run from this directory (loads `./.env`):
 *   pnpm run seed:atlas-global
 *
 * Image bytes: SameWave app icon (PNG) read from `artifacts/same-same/assets/images/icon.png`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
config({ path: path.join(apiRoot, ".env") });

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing — set it in artifacts/api-server/.env");
  process.exit(1);
}

const iconPath = path.resolve(
  apiRoot,
  "..",
  "same-same",
  "assets",
  "images",
  "icon.png",
);
if (!fs.existsSync(iconPath)) {
  console.error("Icon not found at:", iconPath);
  process.exit(1);
}
const bytesB64 = fs.readFileSync(iconPath).toString("base64");
const mime = "image/png";

/** Matches public countries in `artifacts/same-same/data/samplePhotos.ts` (subset). */
const DEMO = {
  users: [
    { id: "atlas_global_seed_u_jp", device: "atlas_global_seed_d_jp", cc: "JP" },
    { id: "atlas_global_seed_u_br", device: "atlas_global_seed_d_br", cc: "BR" },
    { id: "atlas_global_seed_u_et", device: "atlas_global_seed_d_et", cc: "ET" },
    { id: "atlas_global_seed_u_mx", device: "atlas_global_seed_d_mx", cc: "MX" },
    { id: "atlas_global_seed_u_de", device: "atlas_global_seed_d_de", cc: "DE" },
    { id: "atlas_global_seed_u_us", device: "atlas_global_seed_d_us", cc: "US" },
  ],
  photos: [
    {
      id: "atlas_global_seed_p_jp",
      user: "atlas_global_seed_u_jp",
      cc: "JP",
      theme: "morning",
      tags: ["coffee", "warm"],
    },
    {
      id: "atlas_global_seed_p_br",
      user: "atlas_global_seed_u_br",
      cc: "BR",
      theme: "morning",
      tags: ["coffee", "people"],
    },
    {
      id: "atlas_global_seed_p_et",
      user: "atlas_global_seed_u_et",
      cc: "ET",
      theme: "morning",
      tags: ["coffee", "art"],
    },
    {
      id: "atlas_global_seed_p_mx",
      user: "atlas_global_seed_u_mx",
      cc: "MX",
      theme: "food",
      tags: ["meal", "warm"],
    },
    {
      id: "atlas_global_seed_p_de",
      user: "atlas_global_seed_u_de",
      cc: "DE",
      theme: "work",
      tags: ["desk", "laptop"],
    },
    {
      id: "atlas_global_seed_p_us",
      user: "atlas_global_seed_u_us",
      cc: "US",
      theme: "work",
      tags: ["people", "coffee"],
    },
  ],
};

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  await client.query("BEGIN");
  await client.query(
    `DELETE FROM echoes WHERE photo_low_id LIKE 'atlas_global_seed_p_%' OR photo_high_id LIKE 'atlas_global_seed_p_%'`,
  );
  await client.query(`DELETE FROM photos WHERE id LIKE 'atlas_global_seed_p_%'`);
  await client.query(`DELETE FROM users WHERE id LIKE 'atlas_global_seed_u_%'`);

  for (const u of DEMO.users) {
    await client.query(
      `INSERT INTO users (id, device_id, auth_id, country_code, is_pro, created_at)
       VALUES ($1, $2, NULL, $3, false, now())`,
      [u.id, u.device, u.cc],
    );
  }

  for (const p of DEMO.photos) {
    await client.query(
      `INSERT INTO photos (
         id, user_id, bytes_base64, mime_type, theme, tags, shape_tags, subjects,
         country_code, music_genre, custom_audio_base64, custom_audio_mime,
         status, report_count, created_at, expires_at, embedding
       ) VALUES (
         $1, $2, $3, $4, $5, $6::text[], ARRAY[]::text[], ARRAY[]::text[],
         $7, NULL, NULL, NULL,
         'active', 0, now(), NULL, NULL
       )`,
      [
        p.id,
        p.user,
        bytesB64,
        mime,
        p.theme,
        p.tags,
        p.cc,
      ],
    );
  }

  // Wave (mutual): BR ↔ JP — ids ordered low < high lexically.
  await client.query(
    `INSERT INTO echoes (
       id, photo_low_id, photo_high_id, user_low_id, user_high_id, theme, state,
       pending_from_user_id, created_at, mutual_at
     ) VALUES (
       'atlas_global_seed_e_wave_br_jp',
       'atlas_global_seed_p_br',
       'atlas_global_seed_p_jp',
       'atlas_global_seed_u_br',
       'atlas_global_seed_u_jp',
       'morning',
       'mutual',
       NULL,
       now(),
       now()
     )`,
  );

  // Ripple (pending): DE ↔ US — pending_from = owner of low photo (DE).
  await client.query(
    `INSERT INTO echoes (
       id, photo_low_id, photo_high_id, user_low_id, user_high_id, theme, state,
       pending_from_user_id, created_at, mutual_at
     ) VALUES (
       'atlas_global_seed_e_ripple_de_us',
       'atlas_global_seed_p_de',
       'atlas_global_seed_p_us',
       'atlas_global_seed_u_de',
       'atlas_global_seed_u_us',
       'work',
       'pending',
       'atlas_global_seed_u_de',
       now(),
       NULL
     )`,
  );

  await client.query("COMMIT");
  // #region agent log
  fetch("http://127.0.0.1:7459/ingest/e158d8b6-c760-48c9-b31a-14c8f7f50975", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "ac992e",
    },
    body: JSON.stringify({
      sessionId: "ac992e",
      hypothesisId: "H-seed-atlas",
      location: "seed-atlas-global-demo.mjs:COMMIT",
      message: "atlas global seed committed",
      data: { users: DEMO.users.length, photos: DEMO.photos.length, echoes: 2 },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  console.log(
    "Atlas global seed OK — 6 users, 6 photos (JP,BR,ET,MX,DE,US), 1 mutual wave, 1 pending ripple.",
  );
  console.log("Hit GET /api/photos/atlas to verify countries + connections.");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
