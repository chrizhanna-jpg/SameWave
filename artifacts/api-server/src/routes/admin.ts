import { Router, type IRouter, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { imageTelemetryTotals } from "./telemetry";

const router: IRouter = Router();

function rejectIfNotAdmin(req: Request, res: Response): boolean {
  const adminToken = process.env.BACKFILL_ADMIN_TOKEN;
  const provided = req.header("x-admin-token");
  if (!adminToken || !provided || provided !== adminToken) {
    res.status(403).json({ error: "forbidden" });
    return true;
  }
  return false;
}

// ---- GET /api/admin/stats -------------------------------------------------
// Platform totals for the hidden mobile admin screen (owner token).
router.get("/admin/stats", async (req, res) => {
  if (rejectIfNotAdmin(req, res)) return;
  try {
    const userRows = await db.execute(sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (
          WHERE id NOT LIKE 'stock_%' AND id NOT LIKE 'atlas_global_seed_%'
        )::int AS real_users,
        count(*) FILTER (WHERE id LIKE 'stock_%')::int AS stock_synthetic_users,
        count(*) FILTER (WHERE id LIKE 'atlas_global_seed_%')::int AS demo_synthetic_users,
        count(*) FILTER (
          WHERE auth_id IS NOT NULL
            AND id NOT LIKE 'stock_%'
            AND id NOT LIKE 'atlas_global_seed_%'
        )::int AS signed_in,
        count(*) FILTER (
          WHERE is_pro = true
            AND id NOT LIKE 'stock_%'
            AND id NOT LIKE 'atlas_global_seed_%'
        )::int AS pro
      FROM users
    `);
    const photoRows = await db.execute(sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'active')::int AS active,
        count(*) FILTER (
          WHERE status = 'active'
            AND id NOT LIKE 'stock_%'
            AND id NOT LIKE 'atlas_global_seed_%'
        )::int AS user_uploads_active,
        count(*) FILTER (
          WHERE status = 'active' AND id LIKE 'stock_%'
        )::int AS stock_active,
        count(*) FILTER (
          WHERE status = 'active' AND id LIKE 'atlas_global_seed_%'
        )::int AS atlas_demo_active,
        count(*) FILTER (
          WHERE id NOT LIKE 'stock_%' AND id NOT LIKE 'atlas_global_seed_%'
        )::int AS user_uploads_all,
        count(*) FILTER (WHERE id LIKE 'stock_%')::int AS stock_all,
        count(*) FILTER (WHERE id LIKE 'atlas_global_seed_%')::int AS atlas_demo_all
      FROM photos
    `);
    const u = (userRows.rows[0] ?? {}) as Record<string, unknown>;
    const p = (photoRows.rows[0] ?? {}) as Record<string, unknown>;
    res.set("Cache-Control", "private, no-store");
    res.json({
      users: {
        total: Number(u.total ?? 0),
        real: Number(u.real_users ?? 0),
        stockSynthetic: Number(u.stock_synthetic_users ?? 0),
        atlasDemoSynthetic: Number(u.demo_synthetic_users ?? 0),
        signedIn: Number(u.signed_in ?? 0),
        pro: Number(u.pro ?? 0),
      },
      photos: {
        total: Number(p.total ?? 0),
        active: Number(p.active ?? 0),
        userUploadsActive: Number(p.user_uploads_active ?? 0),
        stockActive: Number(p.stock_active ?? 0),
        atlasDemoActive: Number(p.atlas_demo_active ?? 0),
        userUploadsAll: Number(p.user_uploads_all ?? 0),
        stockAll: Number(p.stock_all ?? 0),
        atlasDemoAll: Number(p.atlas_demo_all ?? 0),
      },
      clientBundle: {
        sampleDeckPhotos: 28,
        note: "Sample deck photos are hardcoded Unsplash URLs in the app — not stored in Postgres.",
      },
      imageTelemetry: {
        ...imageTelemetryTotals,
        cacheHitRate:
          imageTelemetryTotals.cacheHit + imageTelemetryTotals.cacheMiss > 0
            ? imageTelemetryTotals.cacheHit /
              (imageTelemetryTotals.cacheHit + imageTelemetryTotals.cacheMiss)
            : null,
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "admin stats failed");
    res.status(500).json({ error: "admin stats failed" });
  }
});

export default router;
