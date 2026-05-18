import { sql, type SQL } from "drizzle-orm";

/** Max points subtracted from candidate rank for global over-exposure. */
export const EXPOSURE_PENALTY_CAP = 12;
/** Weight for each historical "same" vote on a photo. */
export const EXPOSURE_VOTE_SAME_WEIGHT = 1;
/** Weight for each time any user marked the photo seen (deck impression). */
export const EXPOSURE_SEEN_WEIGHT = 0.35;
/** Extra penalty once a photo has this many "same" votes (viral/generic shots). */
export const EXPOSURE_HOT_SAME_THRESHOLD = 20;
export const EXPOSURE_HOT_EXTRA_PENALTY = 6;

/** Max times the same photo may appear across Atlas explore moments in one response. */
export const EXPLORE_MAX_PHOTO_REPEATS = 1;

/**
 * CTE: per-photo exposure tallies from votes + seen ledger.
 * Join as `LEFT JOIN photo_exposure pe ON pe.photo_id = p.id`.
 */
export const photoExposureCte = sql`
  photo_exposure AS (
    SELECT
      ph.id AS photo_id,
      COALESCE(v.same_cnt, 0)::int AS same_votes,
      COALESCE(v.total_cnt, 0)::int AS total_votes,
      COALESCE(s.seen_cnt, 0)::int AS seen_cnt
    FROM photos ph
    LEFT JOIN (
      SELECT
        photo_id,
        COUNT(*) FILTER (WHERE verdict = 'same') AS same_cnt,
        COUNT(*) AS total_cnt
      FROM votes
      GROUP BY photo_id
    ) v ON v.photo_id = ph.id
    LEFT JOIN (
      SELECT photo_id, COUNT(*) AS seen_cnt
      FROM seen_photos
      GROUP BY photo_id
    ) s ON s.photo_id = ph.id
    WHERE ph.status = 'active'
  )
`;

function penaltySql(peAlias: string): string {
  return `LEAST(
    LN(1.0 + COALESCE(${peAlias}.same_votes, 0) * ${EXPOSURE_VOTE_SAME_WEIGHT}
      + COALESCE(${peAlias}.seen_cnt, 0) * ${EXPOSURE_SEEN_WEIGHT}) * 2.5
    + CASE
        WHEN COALESCE(${peAlias}.same_votes, 0) >= ${EXPOSURE_HOT_SAME_THRESHOLD}
        THEN ${EXPOSURE_HOT_EXTRA_PENALTY}
        ELSE 0
      END,
    ${EXPOSURE_PENALTY_CAP}
  )`;
}

/** SQL expression: dampening penalty from a `photo_exposure` row alias (e.g. `pe`). */
export function exposurePenaltyExpr(peAlias: string): SQL {
  return sql.raw(penaltySql(peAlias));
}

/** Pair-level exposure for echo queries (max penalty of both sides). */
export function echoPairExposurePenaltySql(
  lowPeAlias: string,
  highPeAlias: string,
): SQL {
  return sql.raw(`GREATEST(${penaltySql(lowPeAlias)}, ${penaltySql(highPeAlias)})`);
}

export type ExploreMoment = {
  participants: Array<{ photoId: string }>;
};

/** Limit how often one photo id appears in a single explore payload. */
export function capExplorePhotoRepeats<T extends ExploreMoment>(
  moments: T[],
  maxPerPhoto = EXPLORE_MAX_PHOTO_REPEATS,
): T[] {
  const counts = new Map<string, number>();
  const out: T[] = [];
  for (const moment of moments) {
    let blocked = false;
    for (const p of moment.participants) {
      const id = p.photoId;
      if (!id) continue;
      const next = (counts.get(id) ?? 0) + 1;
      if (next > maxPerPhoto) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    for (const p of moment.participants) {
      const id = p.photoId;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    out.push(moment);
  }
  return out;
}
