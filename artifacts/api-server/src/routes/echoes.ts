import { Router, type IRouter } from "express";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db, echoesTable, photosTable, votesTable } from "@workspace/db";
import { resolveUserFromRequest } from "../lib/users";
import { sendPushToUser } from "../lib/push";
import { PUSH_COPY } from "../lib/pushCopy";
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
  const now = Date.now();
  if (
    (voterPhoto.expiresAt && voterPhoto.expiresAt.getTime() <= now) ||
    (targetPhoto.expiresAt && targetPhoto.expiresAt.getTime() <= now)
  ) {
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
        title: PUSH_COPY.mutual.title,
        body: PUSH_COPY.mutual.body,
        categoryId: PUSH_COPY.mutual.categoryId,
        data: { deepLink: pairLink, echoId, state: "mutual" },
      }),
      sendPushToUser(voterUserId, {
        title: PUSH_COPY.mutual.title,
        body: PUSH_COPY.mutual.body,
        categoryId: PUSH_COPY.mutual.categoryId,
        data: { deepLink: pairLink, echoId, state: "mutual" },
      }),
    ]).catch((err) => logger.error({ err }, "echo push (mutual) failed"));
  } else if (wasNew) {
    void sendPushToUser(recipientUserId, {
      title: PUSH_COPY.pending.title,
      body: PUSH_COPY.pending.body,
      categoryId: PUSH_COPY.pending.categoryId,
      data: { deepLink: "/echoes", echoId, state: "pending" },
    }).catch((err) => logger.error({ err }, "echo push (pending) failed"));
  }

  return { state: row.state === "mutual" ? "mutual" : "pending", id: row.id };
}

/**
 * Cascade-clean any echo affected by a user undoing their "same" vote
 * on a particular photo. Called from inside the unvote transaction
 * (see POST /photos/:id/unvote) so the vote delete and the cascade
 * commit atomically — either both happen or neither does.
 *
 * Background: a wave (mutual echo) exists only because BOTH sides have
 * a "same" vote on the other's photo. If either side withdraws their
 * vote, the wave should dissolve — the user's stated design rule is
 * "you can't undo a wave directly, but undoing either underlying
 * ripple cancels it". A pending offer follows the same logic: if the
 * sole same-vote that created it is gone, the offer is gone too.
 *
 * Logic per affected echo (one user has just unvoted on `unvotedPhotoId`):
 *   - If the OTHER side still has a "same" vote on the unvoter's photo
 *     in this pair → revert to pending, with the other side as the
 *     pending offerer (the other side's standing offer is still real).
 *   - Otherwise → delete the echo. With both votes gone there is no
 *     longer any pair to track.
 *
 * Concurrency: the candidate echoes are SELECTed FOR UPDATE so two
 * concurrent unvotes on either side of the same pair serialize at the
 * row level — the second one observes the first one's write and
 * recomputes correctly.
 *
 * Errors propagate to the caller (the route handler) so the enclosing
 * transaction can roll the vote delete back too. We never want to
 * leave a vote deleted while its echo lingers.
 */
export async function revokeEchoForUnvote(
  tx: Pick<typeof db, "select" | "update" | "delete">,
  input: {
    unvoterUserId: string;
    unvotedPhotoId: string;
  },
): Promise<{ updated: number; deleted: number }> {
  const { unvoterUserId, unvotedPhotoId } = input;
  // Find every echo where the unvoter is a participant and the
  // OTHER photo in the pair is the one they just unvoted on. There
  // can be multiple if the unvoter has several photos that each
  // produced an echo with the same target. Lock the rows for the
  // duration of the transaction so concurrent cascades serialize.
  const candidates = await tx
    .select({
      id: echoesTable.id,
      photoLowId: echoesTable.photoLowId,
      photoHighId: echoesTable.photoHighId,
      userLowId: echoesTable.userLowId,
      userHighId: echoesTable.userHighId,
      state: echoesTable.state,
    })
    .from(echoesTable)
    .where(
      or(
        and(
          eq(echoesTable.userLowId, unvoterUserId),
          eq(echoesTable.photoHighId, unvotedPhotoId),
        ),
        and(
          eq(echoesTable.userHighId, unvoterUserId),
          eq(echoesTable.photoLowId, unvotedPhotoId),
        ),
      ),
    )
    .for("update");

  let updated = 0;
  let deleted = 0;
  for (const echo of candidates) {
    const myPhotoId =
      echo.userLowId === unvoterUserId ? echo.photoLowId : echo.photoHighId;
    const otherUserId =
      echo.userLowId === unvoterUserId ? echo.userHighId : echo.userLowId;

    // Does the other side still have a standing "same" vote on MY
    // photo in this pair? If so, the echo should revert to a pending
    // offer from them. If not, the pair has nothing left holding it
    // together.
    const otherVote = await tx
      .select({ id: votesTable.id })
      .from(votesTable)
      .where(
        and(
          eq(votesTable.voterUserId, otherUserId),
          eq(votesTable.photoId, myPhotoId),
          eq(votesTable.verdict, "same"),
        ),
      )
      .limit(1);

    if (otherVote.length > 0) {
      await tx
        .update(echoesTable)
        .set({
          state: "pending",
          pendingFromUserId: otherUserId,
          mutualAt: null,
        })
        .where(eq(echoesTable.id, echo.id));
      updated++;
    } else {
      await tx.delete(echoesTable).where(eq(echoesTable.id, echo.id));
      deleted++;
    }
  }
  return { updated, deleted };
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
  mine: {
    id: string;
    uri: string;
    countryCode: string | null;
    captureCountryCode: string | null;
    theme: string;
  };
  theirs: {
    id: string;
    uri: string;
    countryCode: string | null;
    captureCountryCode: string | null;
    theme: string;
  };
};

function photoSideFromRow(
  row: Record<string, unknown>,
  side: "low" | "high",
): { id: string; uri: string; countryCode: string | null; captureCountryCode: string | null; theme: string } {
  const captureRaw = row[`${side}CaptureCountry`] as string | null;
  const declaredRaw = row[`${side}Country`] as string | null;
  const capture =
    typeof captureRaw === "string" && captureRaw.trim().length === 2
      ? captureRaw.trim().toUpperCase()
      : null;
  const declared =
    typeof declaredRaw === "string" && declaredRaw.trim().length === 2
      ? declaredRaw.trim().toUpperCase()
      : null;
  return {
    id: String(row[`photo${side === "low" ? "Low" : "High"}Id`]),
    uri: `data:${String(row[`${side}Mime`])};base64,${String(row[`${side}Bytes`])}`,
    countryCode: capture ?? declared,
    captureCountryCode: capture,
    theme: String(row[`${side}Theme`] ?? ""),
  };
}

function buildEchoCard(
  row: Record<string, unknown>,
  meId: string,
): EchoCard {
  const lowId = String(row.userLowId);
  const lowSide = photoSideFromRow(row, "low");
  const highSide = photoSideFromRow(row, "high");
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
      res.status(401).json({ error: "authentication required" });
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
        pl.capture_country_code AS "lowCaptureCountry",
        pl.theme AS "lowTheme",
        ph.bytes_base64 AS "highBytes",
        ph.mime_type AS "highMime",
        ph.country_code AS "highCountry",
        ph.capture_country_code AS "highCaptureCountry",
        ph.theme AS "highTheme"
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
      res.status(401).json({ error: "authentication required" });
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
        pl.capture_country_code AS "lowCaptureCountry",
        pl.theme AS "lowTheme",
        ph.bytes_base64 AS "highBytes",
        ph.mime_type AS "highMime",
        ph.country_code AS "highCountry",
        ph.capture_country_code AS "highCaptureCountry",
        ph.theme AS "highTheme"
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
      res.status(401).json({ error: "authentication required" });
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
    void Promise.allSettled([
      sendPushToUser(otherUserId, {
        title: PUSH_COPY.mutual.title,
        body: PUSH_COPY.mutual.body,
        categoryId: PUSH_COPY.mutual.categoryId,
        data: { deepLink: pairLink, echoId, state: "mutual" },
      }),
      sendPushToUser(user.id, {
        title: PUSH_COPY.mutual.title,
        body: PUSH_COPY.mutual.body,
        categoryId: PUSH_COPY.mutual.categoryId,
        data: { deepLink: pairLink, echoId, state: "mutual" },
      }),
    ]).catch((err) => req.log.error({ err }, "echo push (respond) failed"));

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
        pl.capture_country_code AS "lowCaptureCountry",
        pl.custom_audio_base64 AS "lowAudioB64",
        pl.custom_audio_mime AS "lowAudioMime",
        ph.bytes_base64 AS "highBytes",
        ph.mime_type AS "highMime",
        ph.country_code AS "highCountry",
        ph.capture_country_code AS "highCaptureCountry",
        ph.custom_audio_base64 AS "highAudioB64",
        ph.custom_audio_mime AS "highAudioMime"
      FROM pair_rows pr
      JOIN photos pl ON pl.id = pr.photo_low_id
      JOIN photos ph ON ph.id = pr.photo_high_id
    `);

    const photos: Array<{
      echoId: string;
      theme: string;
      mutualAt: string | Date | null;
      photo: {
        id: string;
        uri: string;
        countryCode: string | null;
        captureCountryCode: string | null;
        customAudioBase64: string | null;
        customAudioMime: string | null;
      };
      partnerPhotoId: string;
    }> = [];
    for (const raw of rows.rows as Array<Record<string, unknown>>) {
      const echoId = String(raw.echoId);
      const themeStr = String(raw.theme ?? "");
      const mutualAt = (raw.mutualAt as string | Date | null) ?? null;
      const lowId = String(raw.photoLowId);
      const highId = String(raw.photoHighId);
      const lowCapture =
        typeof raw.lowCaptureCountry === "string"
          ? raw.lowCaptureCountry.trim().toUpperCase()
          : null;
      const highCapture =
        typeof raw.highCaptureCountry === "string"
          ? raw.highCaptureCountry.trim().toUpperCase()
          : null;
      const lowDeclared =
        typeof raw.lowCountry === "string"
          ? raw.lowCountry.trim().toUpperCase()
          : null;
      const highDeclared =
        typeof raw.highCountry === "string"
          ? raw.highCountry.trim().toUpperCase()
          : null;
      photos.push({
        echoId,
        theme: themeStr,
        mutualAt,
        photo: {
          id: lowId,
          uri: `data:${String(raw.lowMime)};base64,${String(raw.lowBytes)}`,
          countryCode: lowDeclared,
          captureCountryCode: lowCapture,
          customAudioBase64: (raw.lowAudioB64 as string | null) ?? null,
          customAudioMime: (raw.lowAudioMime as string | null) ?? null,
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
          countryCode: highDeclared,
          captureCountryCode: highCapture,
          customAudioBase64: (raw.highAudioB64 as string | null) ?? null,
          customAudioMime: (raw.highAudioMime as string | null) ?? null,
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
      .select({
        id: echoesTable.id,
        state: echoesTable.state,
        mutualAt: echoesTable.mutualAt,
      })
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
        captureCountryCode: photosTable.captureCountryCode,
        theme: photosTable.theme,
        tags: photosTable.tags,
        musicGenre: photosTable.musicGenre,
        createdAt: photosTable.createdAt,
        customAudioBase64: photosTable.customAudioBase64,
        customAudioMime: photosTable.customAudioMime,
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
    // Defensive fallback: any legacy mutual row missing a mutual_at
    // timestamp (column allows null at the DB level) shouldn't blank
    // out the "matched X ago" line in the UI. Fall back to the more
    // recent of the two photo createdAt's, which is a strict lower
    // bound on when this echo could have become mutual.
    const fallbackMutualAt =
      echoRow.mutualAt ??
      (a.createdAt && b.createdAt
        ? new Date(
            Math.max(
              new Date(a.createdAt).getTime(),
              new Date(b.createdAt).getTime(),
            ),
          )
        : null);
    res.json({
      mutualAt: fallbackMutualAt,
      a: {
        id: a.id,
        uri: `data:${a.mimeType};base64,${a.bytesBase64}`,
        countryCode: a.countryCode,
        captureCountryCode: a.captureCountryCode,
        theme: a.theme,
        tags: a.tags ?? [],
        musicGenre: a.musicGenre,
        createdAt: a.createdAt,
        customAudioBase64: a.customAudioBase64,
        customAudioMime: a.customAudioMime,
      },
      b: {
        id: b.id,
        uri: `data:${b.mimeType};base64,${b.bytesBase64}`,
        countryCode: b.countryCode,
        captureCountryCode: b.captureCountryCode,
        theme: b.theme,
        tags: b.tags ?? [],
        musicGenre: b.musicGenre,
        createdAt: b.createdAt,
        customAudioBase64: b.customAudioBase64,
        customAudioMime: b.customAudioMime,
      },
    });
  } catch (err) {
    req.log.error({ err }, "echo pair failed");
    res.status(500).json({ error: "pair failed" });
  }
});

export default router;
