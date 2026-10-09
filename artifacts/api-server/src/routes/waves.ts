import { Router, type IRouter } from "express";
import { and, eq, or, sql } from "drizzle-orm";
import { db, echoesTable } from "@workspace/db";
import { resolveUserFromRequest } from "../lib/users";
import { readableVibe } from "../lib/waveName";

const router: IRouter = Router();

router.get("/waves/today-count", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const rows = await db.execute(sql`
      SELECT count(*)::int AS count
      FROM echoes
      WHERE state = 'mutual'
        AND mutual_at >= date_trunc('day', (now() AT TIME ZONE 'UTC'))
    `);
    const count = Number(
      (rows.rows[0] as { count?: number } | undefined)?.count ?? 0,
    );
    res.json({ count });
  } catch (err) {
    req.log.error({ err }, "waves today-count failed");
    res.status(500).json({ error: "count failed" });
  }
});

router.get("/waves/live", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const rows = await db.execute(sql`
      SELECT
        e.mutual_at AS "at",
        COALESCE(pl.capture_country_code, pl.country_code) AS "lowCountry",
        COALESCE(ph.capture_country_code, ph.country_code) AS "highCountry"
      FROM echoes e
      JOIN photos pl ON pl.id = e.photo_low_id
      JOIN photos ph ON ph.id = e.photo_high_id
      WHERE e.state = 'mutual'
        AND e.mutual_at >= now() - interval '60 minutes'
      ORDER BY e.mutual_at DESC
      LIMIT 200
    `);
    const waves: { countryCode: string; at: string }[] = [];
    for (const row of rows.rows as Array<Record<string, unknown>>) {
      const at = row.at instanceof Date ? row.at.toISOString() : String(row.at ?? "");
      for (const key of ["lowCountry", "highCountry"] as const) {
        const code = typeof row[key] === "string" ? row[key].trim().toUpperCase() : "";
        if (code.length === 2 && at) waves.push({ countryCode: code, at });
      }
    }
    res.json({ waves });
  } catch (err) {
    req.log.error({ err }, "waves live failed");
    res.status(500).json({ error: "live failed" });
  }
});

router.get("/waves/of-the-day", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const rows = await db.execute(sql`
      SELECT
        e.id,
        e.wave_name AS "waveName",
        pl.id AS "lowId",
        ph.id AS "highId",
        COALESCE(pl.capture_country_code, pl.country_code) AS "lowCountry",
        COALESCE(ph.capture_country_code, ph.country_code) AS "highCountry",
        pl.theme AS "lowTheme",
        ph.theme AS "highTheme"
      FROM echoes e
      JOIN photos pl ON pl.id = e.photo_low_id
      JOIN photos ph ON ph.id = e.photo_high_id
      WHERE e.state = 'mutual'
        AND e.share_low IS TRUE
        AND e.share_high IS TRUE
        AND e.mutual_at >= date_trunc('day', (now() AT TIME ZONE 'UTC'))
      ORDER BY e.mutual_at DESC
      LIMIT 1
    `);
    const row = rows.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      res.json({ wave: null });
      return;
    }
    const code = (value: unknown) =>
      typeof value === "string" && value.trim().length === 2
        ? value.trim().toUpperCase()
        : "";
    res.json({
      wave: {
        id: String(row.id),
        name: typeof row.waveName === "string" && row.waveName.trim()
          ? row.waveName
          : "The Quiet Wave",
        left: {
          countryCode: code(row.lowCountry),
          vibe: readableVibe(typeof row.lowTheme === "string" ? row.lowTheme : ""),
          photoId: String(row.lowId),
        },
        right: {
          countryCode: code(row.highCountry),
          vibe: readableVibe(typeof row.highTheme === "string" ? row.highTheme : ""),
          photoId: String(row.highId),
        },
      },
    });
  } catch (err) {
    req.log.warn({ err }, "wave of the day unavailable");
    res.json({ wave: null });
  }
});

router.post("/waves/:id/keep", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const found = await db
      .select()
      .from(echoesTable)
      .where(eq(echoesTable.id, req.params.id))
      .limit(1);
    const echo = found[0];
    if (!echo) {
      res.status(404).json({ error: "wave not found" });
      return;
    }
    if (echo.userLowId !== user.id && echo.userHighId !== user.id) {
      res.status(403).json({ error: "not your wave" });
      return;
    }
    await db
      .update(echoesTable)
      .set(echo.userLowId === user.id ? { keptLow: true } : { keptHigh: true })
      .where(eq(echoesTable.id, echo.id));
    res.json({ ok: true });
  } catch (err) {
    req.log.warn({ err }, "wave keep skipped");
    res.json({ ok: false });
  }
});

router.post("/waves/:id/share", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const enabled = (req.body ?? {}).enabled;
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled must be boolean" });
      return;
    }
    const found = await db
      .select()
      .from(echoesTable)
      .where(eq(echoesTable.id, req.params.id))
      .limit(1);
    const echo = found[0];
    if (!echo) {
      res.status(404).json({ error: "wave not found" });
      return;
    }
    if (echo.userLowId !== user.id && echo.userHighId !== user.id) {
      res.status(403).json({ error: "not your wave" });
      return;
    }
    await db
      .update(echoesTable)
      .set(
        echo.userLowId === user.id
          ? { shareLow: enabled }
          : { shareHigh: enabled },
      )
      .where(
        and(
          eq(echoesTable.id, echo.id),
          or(eq(echoesTable.userLowId, user.id), eq(echoesTable.userHighId, user.id)),
        ),
      );
    res.json({ ok: true });
  } catch (err) {
    req.log.warn({ err }, "wave share skipped");
    res.json({ ok: false });
  }
});

export default router;
