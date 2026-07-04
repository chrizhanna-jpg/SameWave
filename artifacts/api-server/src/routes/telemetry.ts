import { Router, type IRouter } from "express";

const router: IRouter = Router();

type SummaryPayload = {
  cacheHit?: number;
  cacheMiss?: number;
  sampleCacheHit?: number;
  sampleCacheMiss?: number;
  userCacheHit?: number;
  userCacheMiss?: number;
  conditional304?: number;
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
  sampleCacheHit: 0,
  sampleCacheMiss: 0,
  userCacheHit: 0,
  userCacheMiss: 0,
  conditional304: 0,
  blankFrame: 0,
  error: 0,
  prefetch: 0,
  reports: 0,
};

function hitRate(hits: number, misses: number): number | null {
  const d = hits + misses;
  return d > 0 ? hits / d : null;
}

// ---- POST /api/telemetry/image-summary ------------------------------------
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
  totals.sampleCacheHit += Math.max(0, Number(body.sampleCacheHit ?? 0));
  totals.sampleCacheMiss += Math.max(0, Number(body.sampleCacheMiss ?? 0));
  totals.userCacheHit += Math.max(0, Number(body.userCacheHit ?? 0));
  totals.userCacheMiss += Math.max(0, Number(body.userCacheMiss ?? 0));
  totals.conditional304 += Math.max(0, Number(body.conditional304 ?? 0));
  totals.blankFrame += Math.max(0, Number(body.blankFrame ?? 0));
  totals.error += Math.max(0, Number(body.error ?? 0));
  totals.prefetch += Math.max(0, Number(body.prefetch ?? 0));
  totals.reports += 1;
  recentSummaries.push({
    cacheHit: hit,
    cacheMiss: miss,
    sampleCacheHit: Number(body.sampleCacheHit ?? 0),
    sampleCacheMiss: Number(body.sampleCacheMiss ?? 0),
    userCacheHit: Number(body.userCacheHit ?? 0),
    userCacheMiss: Number(body.userCacheMiss ?? 0),
    conditional304: Number(body.conditional304 ?? 0),
    blankFrame: Number(body.blankFrame ?? 0),
    error: Number(body.error ?? 0),
    prefetch: Number(body.prefetch ?? 0),
    at: typeof body.at === "string" ? body.at : new Date().toISOString(),
  });
  if (recentSummaries.length > MAX_SUMMARIES) {
    recentSummaries.splice(0, recentSummaries.length - MAX_SUMMARIES);
  }
  req.log.info(
    {
      hit,
      miss,
      sampleHit: body.sampleCacheHit,
      userHit: body.userCacheHit,
      c304: body.conditional304,
      device: req.header("x-device-id"),
    },
    "image telemetry summary",
  );
  res.set("Cache-Control", "no-store");
  res.status(204).end();
});

// ---- GET /api/telemetry/image-summary -------------------------------------
router.get("/telemetry/image-summary", (_req, res) => {
  res.json({
    totals,
    cacheHitRate: hitRate(totals.cacheHit, totals.cacheMiss),
    sampleCacheHitRate: hitRate(totals.sampleCacheHit, totals.sampleCacheMiss),
    userCacheHitRate: hitRate(totals.userCacheHit, totals.userCacheMiss),
    recent: recentSummaries.slice(-20),
  });
});

export default router;
export { totals as imageTelemetryTotals };
