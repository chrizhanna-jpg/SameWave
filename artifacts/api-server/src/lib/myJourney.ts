import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export type JourneyMatchRow = {
  id: string;
  verdict: "same" | "different";
  timestamp: string;
  theirPhotoId: string;
  myPhotoId: string | null;
  theirCaptureCountryCode: string | null;
  theirCountryCode: string | null;
  myCaptureCountryCode: string | null;
  myCountryCode: string | null;
  theme: string | null;
  tags: string[];
  musicGenre: string | null;
  myPhotoUploadedAt: string | null;
  theirPhotoActive: boolean;
  myPhotoActive: boolean;
};

function iso2(raw: unknown): string | null {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(u) ? u : null;
}

function normTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** All swipe history for My Journey — same + different (for flip / undo). */
export async function fetchMyJourneyRows(
  userId: string,
): Promise<JourneyMatchRow[]> {
  const rows = await db.execute(sql`
    SELECT
      v.id::text AS vote_id,
      v.verdict AS verdict,
      v.created_at AS voted_at,
      v.photo_id::text AS their_photo_id,
      COALESCE(
        v.voter_photo_id::text,
        (
          SELECT CASE
            WHEN e.photo_low_id = v.photo_id::text THEN e.photo_high_id
            WHEN e.photo_high_id = v.photo_id::text THEN e.photo_low_id
            ELSE NULL
          END
          FROM echoes e
          WHERE (e.photo_low_id = v.photo_id::text OR e.photo_high_id = v.photo_id::text)
            AND (e.user_low_id = v.voter_user_id OR e.user_high_id = v.voter_user_id)
          LIMIT 1
        ),
        (
          SELECT p2.id::text
          FROM photos p2
          WHERE p2.user_id = v.voter_user_id
            AND p2.created_at <= v.created_at
          ORDER BY p2.created_at DESC
          LIMIT 1
        )
      ) AS my_photo_id,
      tp.capture_country_code AS their_capture,
      tp.country_code AS their_declared,
      u_tp.country_code AS their_user_country,
      vp.capture_country_code AS my_capture,
      vp.country_code AS my_declared,
      u_me.country_code AS my_profile_country,
      tp.theme AS their_theme,
      tp.tags AS their_tags,
      tp.music_genre AS their_music,
      vp.created_at AS my_uploaded_at,
      (
        tp.status = 'active'
        AND tp.report_count < 3
        AND (tp.expires_at IS NULL OR tp.expires_at > now())
      ) AS their_active,
      (
        vp.id IS NOT NULL
        AND vp.status = 'active'
        AND vp.report_count < 3
        AND (vp.expires_at IS NULL OR vp.expires_at > now())
      ) AS my_active
    FROM votes v
    INNER JOIN photos tp ON tp.id = v.photo_id
    INNER JOIN users u_tp ON u_tp.id = tp.user_id
    LEFT JOIN photos vp ON vp.id::text = COALESCE(
      v.voter_photo_id::text,
      (
        SELECT CASE
          WHEN e.photo_low_id = v.photo_id::text THEN e.photo_high_id
          WHEN e.photo_high_id = v.photo_id::text THEN e.photo_low_id
          ELSE NULL
        END
        FROM echoes e
        WHERE (e.photo_low_id = v.photo_id::text OR e.photo_high_id = v.photo_id::text)
          AND (e.user_low_id = v.voter_user_id OR e.user_high_id = v.voter_user_id)
        LIMIT 1
      ),
      (
        SELECT p2.id::text
        FROM photos p2
        WHERE p2.user_id = v.voter_user_id
          AND p2.created_at <= v.created_at
        ORDER BY p2.created_at DESC
        LIMIT 1
      )
    )
    LEFT JOIN users u_me ON u_me.id = v.voter_user_id
    WHERE v.voter_user_id = ${userId}
    ORDER BY v.created_at DESC
    LIMIT 500
  `);

  const out: JourneyMatchRow[] = [];
  for (const raw of rows.rows as Array<Record<string, unknown>>) {
    const verdict = String(raw.verdict ?? "");
    if (verdict !== "same" && verdict !== "different") continue;
    const theirPhotoId = String(raw.their_photo_id ?? "").trim();
    if (!theirPhotoId) continue;
    const votedAt = raw.voted_at ? new Date(String(raw.voted_at)).toISOString() : new Date(0).toISOString();
    out.push({
      id: `journey-${theirPhotoId}`,
      verdict,
      timestamp: votedAt,
      theirPhotoId,
      myPhotoId: String(raw.my_photo_id ?? "").trim() || null,
      theirCaptureCountryCode: iso2(raw.their_capture),
      theirCountryCode:
        iso2(raw.their_capture) ??
        iso2(raw.their_declared) ??
        iso2(raw.their_user_country),
      myCaptureCountryCode: iso2(raw.my_capture),
      myCountryCode:
        iso2(raw.my_capture) ??
        iso2(raw.my_declared) ??
        iso2(raw.my_profile_country),
      theme: String(raw.their_theme ?? "").trim() || null,
      tags: normTags(raw.their_tags),
      musicGenre: String(raw.their_music ?? "").trim() || null,
      myPhotoUploadedAt: raw.my_uploaded_at
        ? new Date(String(raw.my_uploaded_at)).toISOString()
        : null,
      theirPhotoActive: raw.their_active === true,
      myPhotoActive: raw.my_active === true,
    });
  }
  return out;
}
