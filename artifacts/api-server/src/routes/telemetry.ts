import { Router, type IRouter } from "express";

const router: IRouter = Router();

type SummaryPayload = {
  cacheHit?: number;
  cacheMiss?: number;
  blankFrame?: number;
  error?: number;
  prefetch?: number;
  at?: string;
};

const recentSummaries: SummaryPayload[] = [];
const MAX_SUMMARIES = 200;

let totals = {
  cacheHit: 0,
  cacheMiss: 0,
  blankFrame: 0,
  error: 0,
  prefetch: 0,
  reports: 0,
};

// ---- POST /api/telemetry/image-summary ------------------------------------
// Compact batched counters from mobile clients — no per-event storage.
router.post("/telemetry/image-summary", (req, res) => {
  const body = (req.body ?? {}) as SummaryPayload;
  const hit = Number(body.cacheHit ?? 0);
  const miss = Number(body.cacheMiss ?? 0);
  if (!Number.isFinite(hit) || !Number.isFinite(miss)) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  totals.cacheHit += Math.max(0, hit);
  totals.cacheMiss += Math.max(0, miss);
  totals.blankFrame += Math.max(0, Number(body.blankFrame ?? 0));
  totals.error += Math.max(0, Number(body.error ?? 0));
  totals.prefetch += Math.max(0, Number(body.prefetch ?? 0));
  totals.reports += 1;
  recentSummaries.push({
    cacheHit: hit,
    cacheMiss: miss,
    blankFrame: Number(body.blankFrame ?? 0),
    error: Number(body.error ?? 0),
    prefetch: Number(body.prefetch ?? 0),
    at: typeof body.at === "string" ? body.at : new Date().toISOString(),
  });
  if (recentSummaries.length > MAX_SUMMARIES) {
    recentSummaries.splice(0, recentSummaries.length - MAX_SUMMARIES);
  }
  req.log.info(
    { hit, miss, blank: body.blankFrame, device: req.header("x-device-id") },
    "image telemetry summary",
  );
  res.set("Cache-Control", "no-store");
  res.status(204).end();
});

// ---- GET /api/telemetry/image-summary (admin-style read, no auth for now) -
router.get("/telemetry/image-summary", (_req, res) => {
  const denom = totals.cacheHit + totals.cacheMiss;
  res.json({
    totals,
    cacheHitRate: denom > 0 ? totals.cacheHit / denom : null,
    recent: recentSummaries.slice(-20),
  });
});

export default router;
export { totals as imageTelemetryTotals };
