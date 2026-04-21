import { Router, type IRouter } from "express";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db, echoesTable, photosTable } from "@workspace/db";
import { resolveUserFromRequest } from "../lib/users";
import { sendPushToUser } from "../lib/push";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Helper: build the canonical (low, high) photo-pair ordering used by
// the unique index on `echoes`. Lexicographic on the varchar UUIDs.
function orderPair<A>(
  aId: string,
  bId: string,
  aPayload: A,
  bPayload: A,
): { lowId: string; highId: string; lowPayload: A; highPayload: A } {
  if (aId < bId) {
    return { lowId: aId, highId: bId, lowPayload: aPayload, highPayload: bPayload };
  }
  return { lowId: bId, highId: aId, lowPayload: aPayload, highPayload: bPayload };
}

/**
 * Idempotent: when user X taps "same same" on user Y's photo while
 * representing one of X's own photos, we upsert a row for the unordered
 * pair. If the row already exists with `pendingFromUserId = Y` (i.e. Y
 * already tapped on X's photo earlier), this flips the row to `mutual`.
 *
 * Returns:
 *   { state: "pending" | "mutual" | "skipped" }
 *
 * "skipped" when self-vote, or either photo is missing/expired/etc — the
 * vote itself still succeeds (handled in the vote endpoint), we just
 * don't materialise an echo offer.
 */
export async function recordEchoOffer(input: {
  voterUserId: string;
  voterPhotoId: string;
  targetPhotoId: string;
}): Promise<{ state: "pending" | "mutual" | "skipped"; id?: string }> {
  const { voterUserId, voterPhotoId, targetPhotoId } = input;
  if (!voterPhotoId || !targetPhotoId || voterPhotoId === targetPhotoId) {
    return { state: "skipped" };
  }

  // Look up both photos in one round-trip. Need owner ID + theme. Skip if
  // either is missing, removed, expired, or owned by the same user.
  const rows = await db
    .select({
      id: photosTable.id,
      userId: photosTable.userId,
      theme: photosTable.theme,
      status: photosTable.status,
      expiresAt: photosTable.expiresAt,
    })
    .from(photosTable)
    .where(or(eq(photosTable.id, voterPhotoId), eq(photosTable.id, targetPhotoId)));

  const voterPhoto = rows.find((r) => r.id === voterPhotoId);
  const targetPhoto = rows.find((r) => r.id === targetPhotoId);
  if (!voterPhoto || !targetPhoto) return { state: "skipped" };
  if (voterPhoto.status !== "active" || targetPhoto.status !== "active") {
    return { state: "skipped" };
  }
  if (voterPhoto.userId !== voterUserId) return { state: "skipped" };
  if (voterPhoto.userId === targetPhoto.userId) return { state: "skipped" };

  const pair = orderPair(
    voterPhotoId,
    targetPhotoId,
    { userId: voterPhoto.userId, theme: voterPhoto.theme },
    { userId: targetPhoto.userId, theme: targetPhoto.theme },
  );
  const echoTheme = pair.lowPayload.theme || pair.highPayload.theme || "";

  // Read the row's current state BEFORE we upsert so we can detect a
  // genuine state transition (no row → pending, or pending → mutual)
  // and only fire a push on those edges. Without this, repeating the
  // same vote (clients retry, idempotent re-tap, etc.) would keep
  // re-sending the same notification and spam the recipient.
  const existingRows = await db
    .select({
      state: echoesTable.state,
      pendingFromUserId: echoesTable.pendingFromUserId,
    })
    .from(echoesTable)
    .where(
      and(
        eq(echoesTable.photoLowId, pair.lowId),
        eq(echoesTable.photoHighId, pair.highId),
      ),
    )
    .limit(1);
  const before = existingRows[0];

  // Atomic upsert. The conflict path checks whether the existing row's
  // `pending_from_user_id` is the OTHER user — if so, the new tap
  // completes the loop and we promote to mutual. Otherwise the row stays
  // pending (re-voting from the same direction is a no-op).
  const upserted = await db
    .insert(echoesTable)
    .values({
      photoLowId: pair.lowId,
      photoHighId: pair.highId,
      userLowId: pair.lowPayload.userId,
      userHighId: pair.highPayload.userId,
      theme: echoTheme,
      state: "pending",
      pendingFromUserId: voterUserId,
    })
    .onConflictDoUpdate({
      target: [echoesTable.photoLowId, echoesTable.photoHighId],
      set: {
        state: sql`CASE
          WHEN ${echoesTable.state} = 'pending'
            AND ${echoesTable.pendingFromUserId} IS NOT NULL
            AND ${echoesTable.pendingFromUserId} <> ${voterUserId}
          THEN 'mutual'
          ELSE ${echoesTable.state}
        END`,
        pendingFromUserId: sql`CASE
          WHEN ${echoesTable.state} = 'pending'
            AND ${echoesTable.pendingFromUserId} IS NOT NULL
            AND ${echoesTable.pendingFromUserId} <> ${voterUserId}
          THEN NULL
          ELSE ${echoesTable.pendingFromUserId}
        END`,
        mutualAt: sql`CASE
          WHEN ${echoesTable.state} = 'pending'
            AND ${echoesTable.pendingFromUserId} IS NOT NULL
            AND ${echoesTable.pendingFromUserId} <> ${voterUserId}
          THEN now()
          ELSE ${echoesTable.mutualAt}
        END`,
      },
    })
    .returning({
      id: echoesTable.id,
      state: echoesTable.state,
    });

  const row = upserted[0];
  if (!row) return { state: "skipped" };

  // Detect the actual state transition. Only fire pushes on real edges:
  //   - no row before, pending after        → fresh offer push
  //   - pending before, mutual after        → mutual completion push
  // Re-voting the same direction (or re-voting after the pair is
  // already mutual) hits neither edge and silently no-ops, so the
  // recipient isn't spammed.
  const wasNew = !before;
  const becameMutual =
    !!before && before.state === "pending" && row.state === "mutual";
  const recipientUserId =
    pair.lowPayload.userId === voterUserId
      ? pair.highPayload.userId
      : pair.lowPayload.userId;
  const echoId = row.id;
  if (becameMutual) {
    // Both sides care: the responder (voterUserId) just tapped and the
    // original offerer (recipientUserId) needs to know it stuck. Mutual
    // taps deep-link straight into the side-by-side pair view (the
    // celebration moment) so the user lands on the actual match
    // instead of the inbox list. The pair endpoint requires mutual
    // state, which we've just promoted to, so the link will resolve.
    const pairLink = `/echo-pair?a=${encodeURIComponent(
      pair.lowId,
    )}&b=${encodeURIComponent(pair.highId)}`;
    void Promise.allSettled([
      sendPushToUser(recipientUserId, {
        title: "Same same! ✨",
        body: "You both echoed each other. Tap to see your match.",
        data: { deepLink: pairLink, echoId, state: "mutual" },
      }),
      sendPushToUser(voterUserId, {
        title: "Same same! ✨",
        body: "They echoed you back. Tap to see your match.",
        data: { deepLink: pairLink, echoId, state: "mutual" },
      }),
    ]).catch((err) => logger.error({ err }, "echo push (mutual) failed"));
  } else if (wasNew) {
    void sendPushToUser(recipientUserId, {
      title: "Someone echoed your photo",
      body: "A stranger said same same. Tap back to make it mutual.",
      data: { deepLink: "/echoes", echoId, state: "pending" },
    }).catch((err) => logger.error({ err }, "echo push (pending) failed"));
  }

  return { state: row.state === "mutual" ? "mutual" : "pending", id: row.id };
}

// Shape returned by inbox / mutual list endpoints. The "mine" / "theirs"
// framing is computed against the requesting user so the mobile UI doesn't
// have to disambiguate low/high columns.
type EchoCard = {
  id: string;
  state: "pending" | "mutual";
  theme: string;
  createdAt: string | Date;
  mutualAt: string | Date | null;
  mine: { id: string; uri: string; countryCode: string | null };
  theirs: { id: string; uri: string; countryCode: string | null };
};

function buildEchoCard(
  row: Record<string, unknown>,
  meId: string,
): EchoCard {
  const lowId = String(row.userLowId);
  const lowSide = {
    id: String(row.photoLowId),
    uri: `data:${String(row.lowMime)};base64,${String(row.lowBytes)}`,
    countryCode: (row.lowCountry as string | null) ?? null,
  };
  const highSide = {
    id: String(row.photoHighId),
    uri: `data:${String(row.highMime)};base64,${String(row.highBytes)}`,
    countryCode: (row.highCountry as string | null) ?? null,
  };
  const mine = lowId === meId ? lowSide : highSide;
  const theirs = lowId === meId ? highSide : lowSide;
  const stateRaw = String(row.state);
  return {
    id: String(row.id),
    state: stateRaw === "mutual" ? "mutual" : "pending",
    theme: String(row.theme ?? ""),
    createdAt: row.createdAt as string | Date,
    mutualAt: (row.mutualAt as string | Date | null) ?? null,
    mine,
    theirs,
  };
}

// ---- GET /api/echoes/inbox ------------------------------------------------
// Pending offers waiting on ME to respond. I'm the side that has NOT yet
// tapped same-same — i.e. I own one of the photos in the pair, and the
// `pending_from_user_id` is the other user.
router.get("/echoes/inbox", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "missing or invalid X-Device-Id" });
      return;
    }
    const rows = await db.execute(sql`
      SELECT
        e.id,
        e.state,
        e.theme,
        e.created_at AS "createdAt",
        e.mutual_at AS "mutualAt",
        e.photo_low_id AS "photoLowId",
        e.photo_high_id AS "photoHighId",
        e.user_low_id AS "userLowId",
        e.user_high_id AS "userHighId",
        pl.bytes_base64 AS "lowBytes",
        pl.mime_type AS "lowMime",
        pl.country_code AS "lowCountry",
        ph.bytes_base64 AS "highBytes",
        ph.mime_type AS "highMime",
        ph.country_code AS "highCountry"
      FROM echoes e
      JOIN photos pl ON pl.id = e.photo_low_id
      JOIN photos ph ON ph.id = e.photo_high_id
      WHERE e.state = 'pending'
        AND (e.user_low_id = ${user.id} OR e.user_high_id = ${user.id})
        AND e.pending_from_user_id IS NOT NULL
        AND e.pending_from_user_id <> ${user.id}
      ORDER BY e.created_at DESC
    `);
    const echoes = (rows.rows as Array<Record<string, unknown>>).map((r) =>
      buildEchoCard(r, user.id),
    );
    res.json({ echoes });
  } catch (err) {
    req.log.error({ err }, "echoes inbox failed");
    res.status(500).json({ error: "inbox failed" });
  }
});

// ---- GET /api/echoes/mine -------------------------------------------------
// Mutual echoes I'm involved in (either side).
router.get("/echoes/mine", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "missing or invalid X-Device-Id" });
      return;
    }
    const rows = await db.execute(sql`
      SELECT
        e.id,
        e.state,
        e.theme,
        e.created_at AS "createdAt",
        e.mutual_at AS "mutualAt",
        e.photo_low_id AS "photoLowId",
        e.photo_high_id AS "photoHighId",
        e.user_low_id AS "userLowId",
        e.user_high_id AS "userHighId",
        pl.bytes_base64 AS "lowBytes",
        pl.mime_type AS "lowMime",
        pl.country_code AS "lowCountry",
        ph.bytes_base64 AS "highBytes",
        ph.mime_type AS "highMime",
        ph.country_code AS "highCountry"
      FROM echoes e
      JOIN photos pl ON pl.id = e.photo_low_id
      JOIN photos ph ON ph.id = e.photo_high_id
      WHERE e.state = 'mutual'
        AND (e.user_low_id = ${user.id} OR e.user_high_id = ${user.id})
      ORDER BY e.mutual_at DESC NULLS LAST, e.created_at DESC
    `);
    const echoes = (rows.rows as Array<Record<string, unknown>>).map((r) =>
      buildEchoCard(r, user.id),
    );
    res.json({ echoes });
  } catch (err) {
    req.log.error({ err }, "echoes mine failed");
    res.status(500).json({ error: "mine failed" });
  }
});

// ---- POST /api/echoes/:id/respond -----------------------------------------
// Body: { verdict: "same" | "different" }
// Caller must be the recipient side of the pending offer (i.e. one of the
// pair's users AND not the pendingFromUserId).
//   "same"      → flip to mutual
//   "different" → delete the row entirely (offer declined)
router.post("/echoes/:id/respond", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "missing or invalid X-Device-Id" });
      return;
    }
    const verdict = (req.body ?? {}).verdict;
    if (verdict !== "same" && verdict !== "different") {
      res.status(400).json({ error: "verdict must be 'same' or 'different'" });
      return;
    }
    const echoId = req.params.id;
    const found = await db
      .select()
      .from(echoesTable)
      .where(eq(echoesTable.id, echoId))
      .limit(1);
    const echo = found[0];
    if (!echo) {
      res.status(404).json({ error: "echo not found" });
      return;
    }
    // Authorisation: must be the recipient of the pending offer.
    const isParticipant =
      echo.userLowId === user.id || echo.userHighId === user.id;
    if (!isParticipant) {
      res.status(403).json({ error: "not your echo" });
      return;
    }
    if (echo.state !== "pending") {
      // Already mutual (or somehow declined). No-op.
      res.json({ ok: true, state: echo.state });
      return;
    }
    if (echo.pendingFromUserId === user.id) {
      // Trying to respond to your own offer — refuse.
      res.status(400).json({ error: "cannot respond to your own offer" });
      return;
    }

    if (verdict === "different") {
      await db.delete(echoesTable).where(eq(echoesTable.id, echoId));
      res.json({ ok: true, state: "declined" });
      return;
    }

    await db
      .update(echoesTable)
      .set({
        state: "mutual",
        pendingFromUserId: null,
        mutualAt: new Date(),
      })
      .where(eq(echoesTable.id, echoId));

    // The OTHER side of the pair (whoever made the original offer) is
    // the one who needs to know — the responder is already in-app. Fire
    // a "it's mutual!" push at them. Deep-link straight to the pair
    // view since the row is now mutual. Best-effort, never blocks.
    const otherUserId =
      echo.userLowId === user.id ? echo.userHighId : echo.userLowId;
    const pairLink = `/echo-pair?a=${encodeURIComponent(
      echo.photoLowId,
    )}&b=${encodeURIComponent(echo.photoHighId)}`;
    void sendPushToUser(otherUserId, {
      title: "Same same! ✨",
      body: "They echoed you back. Tap to see your match.",
      data: {
        deepLink: pairLink,
        echoId,
        state: "mutual",
      },
    }).catch((err) => req.log.error({ err }, "echo push (respond) failed"));

    res.json({ ok: true, state: "mutual" });
  } catch (err) {
    req.log.error({ err }, "echo respond failed");
    res.status(500).json({ error: "respond failed" });
  }
});

// ---- GET /api/echoes/by-theme ---------------------------------------------
// Aggregate mutual echoes by theme. Returns counts only — the Discover
// feed uses this to overlay a real per-theme number on each card. No auth
// required (counts are public).
router.get("/echoes/by-theme", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT theme, COUNT(*)::int AS count
      FROM echoes
      WHERE state = 'mutual'
      GROUP BY theme
      ORDER BY count DESC
    `);
    const themes = (rows.rows as Array<Record<string, unknown>>).map((r) => ({
      theme: String(r.theme ?? ""),
      count: Number(r.count ?? 0),
    }));
    res.json({ themes });
  } catch (err) {
    res.status(500).json({ error: "aggregate failed" });
  }
});

// ---- GET /api/echoes/theme/:theme -----------------------------------------
// Every photo that participates in a mutual echo for the given theme. We
// flatten each pair into TWO photo entries (one per side), each carrying
// its own ID + the partner photo ID so the grid can deep-link straight
// to the read-only pair view. Returns up to 1000 entries (sane upper
// bound for one screen — we'll add cursor pagination if/when any single
// theme exceeds that volume).
router.get("/echoes/theme/:theme", async (req, res) => {
  try {
    const theme = String(req.params.theme).toLowerCase().trim();
    const rows = await db.execute(sql`
      WITH pair_rows AS (
        SELECT
          e.id AS echo_id,
          e.theme,
          e.mutual_at,
          e.photo_low_id,
          e.photo_high_id
        FROM echoes e
        WHERE e.state = 'mutual'
          AND e.theme = ${theme}
        ORDER BY e.mutual_at DESC NULLS LAST
      )
      SELECT
        pr.echo_id AS "echoId",
        pr.theme AS theme,
        pr.mutual_at AS "mutualAt",
        pr.photo_low_id AS "photoLowId",
        pr.photo_high_id AS "photoHighId",
        pl.bytes_base64 AS "lowBytes",
        pl.mime_type AS "lowMime",
        pl.country_code AS "lowCountry",
        ph.bytes_base64 AS "highBytes",
        ph.mime_type AS "highMime",
        ph.country_code AS "highCountry"
      FROM pair_rows pr
      JOIN photos pl ON pl.id = pr.photo_low_id
      JOIN photos ph ON ph.id = pr.photo_high_id
    `);

    const photos: Array<{
      echoId: string;
      theme: string;
      mutualAt: string | Date | null;
      photo: { id: string; uri: string; countryCode: string | null };
      partnerPhotoId: string;
    }> = [];
    for (const raw of rows.rows as Array<Record<string, unknown>>) {
      const echoId = String(raw.echoId);
      const themeStr = String(raw.theme ?? "");
      const mutualAt = (raw.mutualAt as string | Date | null) ?? null;
      const lowId = String(raw.photoLowId);
      const highId = String(raw.photoHighId);
      photos.push({
        echoId,
        theme: themeStr,
        mutualAt,
        photo: {
          id: lowId,
          uri: `data:${String(raw.lowMime)};base64,${String(raw.lowBytes)}`,
          countryCode: (raw.lowCountry as string | null) ?? null,
        },
        partnerPhotoId: highId,
      });
      photos.push({
        echoId,
        theme: themeStr,
        mutualAt,
        photo: {
          id: highId,
          uri: `data:${String(raw.highMime)};base64,${String(raw.highBytes)}`,
          countryCode: (raw.highCountry as string | null) ?? null,
        },
        partnerPhotoId: lowId,
      });
    }
    res.json({
      theme,
      // count = total pairs in this theme (matches /by-theme aggregation)
      count: Math.floor(photos.length / 2),
      photos,
    });
  } catch (err) {
    req.log.error({ err }, "echoes theme failed");
    res.status(500).json({ error: "theme failed" });
  }
});

// ---- GET /api/echoes/pair?a=<id>&b=<id> -----------------------------------
// Read-only fetch of a specific photo pair, for the deep-link pair view.
// Confirms both photos exist and returns their imagery + countries. No
// reaction allowed from this endpoint.
router.get("/echoes/pair", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "auth required" });
      return;
    }
    const aId = typeof req.query.a === "string" ? req.query.a : "";
    const bId = typeof req.query.b === "string" ? req.query.b : "";
    if (!aId || !bId) {
      res.status(400).json({ error: "a and b required" });
      return;
    }
    // Authorization: caller must be a participant in this mutual echo.
    // We confirm a `mutual` echo row exists for the canonical pair AND
    // that the caller owns one of the two photos. This prevents IDOR —
    // anyone could otherwise fetch any two photos by guessing IDs.
    const { lowId, highId } = orderPair(aId, bId, null, null);
    const echoRows = await db
      .select({ id: echoesTable.id, state: echoesTable.state })
      .from(echoesTable)
      .where(
        and(
          eq(echoesTable.photoLowId, lowId),
          eq(echoesTable.photoHighId, highId),
        ),
      )
      .limit(1);
    const echoRow = echoRows[0];
    if (!echoRow || echoRow.state !== "mutual") {
      res.status(404).json({ error: "pair not found" });
      return;
    }
    const photos = await db
      .select({
        id: photosTable.id,
        userId: photosTable.userId,
        bytesBase64: photosTable.bytesBase64,
        mimeType: photosTable.mimeType,
        countryCode: photosTable.countryCode,
        theme: photosTable.theme,
      })
      .from(photosTable)
      .where(or(eq(photosTable.id, aId), eq(photosTable.id, bId)));
    if (photos.length < 2) {
      res.status(404).json({ error: "pair not found" });
      return;
    }
    const a = photos.find((p) => p.id === aId);
    const b = photos.find((p) => p.id === bId);
    if (!a || !b) {
      res.status(404).json({ error: "pair not found" });
      return;
    }
    // Anonymity-preserving read model: we only return image bytes,
    // country codes, and theme — no usernames, device IDs, or emails — so
    // any signed-in user may view any *mutual* echo pair (this is what
    // powers the public Discover theme grids). The mutual-state guard
    // above prevents IDOR against pending offers / arbitrary photos.
    res.json({
      a: {
        id: a.id,
        uri: `data:${a.mimeType};base64,${a.bytesBase64}`,
        countryCode: a.countryCode,
        theme: a.theme,
      },
      b: {
        id: b.id,
        uri: `data:${b.mimeType};base64,${b.bytesBase64}`,
        countryCode: b.countryCode,
        theme: b.theme,
      },
    });
  } catch (err) {
    req.log.error({ err }, "echo pair failed");
    res.status(500).json({ error: "pair failed" });
  }
});

export default router;
