/**
 * Verify stock display cache warm + fast image hits on local api-server.
 *   node ./scripts/test-stock-display-cache.mjs
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
config({ path: path.join(apiRoot, ".env") });

const base = (process.env.API_TEST_ORIGIN ?? "http://127.0.0.1:8787").replace(
  /\/$/,
  "",
);
const deviceId = "devbypass01local";

async function getJson(pathname) {
  const res = await fetch(`${base}${pathname}`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { ok: res.ok, status: res.status, json };
}

async function timeImage(photoId, width = 960) {
  const url = `${base}/api/photos/${encodeURIComponent(photoId)}/image?w=${width}`;
  const start = performance.now();
  const res = await fetch(url, {
    headers: { "X-Device-Id": deviceId },
  });
  const buf = await res.arrayBuffer();
  const ms = performance.now() - start;
  return {
    ok: res.ok,
    status: res.status,
    ms,
    bytes: buf.byteLength,
    contentType: res.headers.get("content-type"),
  };
}

async function waitForWarm(minPinned = 3, timeoutMs = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { json } = await getJson("/api/public/stock-cache-status");
    const pinned = json?.pinnedStockDisplayEntries ?? 0;
    process.stdout.write(`\r  pinned: ${pinned}   `);
    if (pinned >= minPinned) {
      console.log("");
      return json;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("stock cache warm timed out");
}

console.log(`API: ${base}`);
const health = await getJson("/api/healthz");
if (!health.ok) {
  console.error("API not reachable", health);
  process.exit(1);
}

console.log("Waiting for stock display cache warm…");
const status = await waitForWarm(3);
console.log("Cache status:", status);

const photoId = "stock_dev_001";
console.log(`\nTiming GET /api/photos/${photoId}/image?w=960`);
const first = await timeImage(photoId);
console.log("  run 1:", first);
const second = await timeImage(photoId);
console.log("  run 2:", second);

const candidates = await fetch(
  `${base}/api/photos/candidates?theme=coffee&limit=5`,
  { headers: { "X-Device-Id": deviceId } },
);
const candJson = await candidates.json();
const stockUri =
  candJson?.candidates?.find((c) => String(c.id).startsWith("stock_"))?.uri ??
  `/api/photos/${photoId}/image`;

console.log("\nCandidates sample:", {
  count: candJson?.candidates?.length ?? 0,
  firstStock: stockUri,
});

if (!first.ok || !second.ok) {
  console.error("Image fetch failed");
  process.exit(1);
}

const speedup = first.ms / Math.max(second.ms, 1);
console.log(`\nSecond hit ${speedup.toFixed(1)}× vs first (${first.ms.toFixed(0)}ms → ${second.ms.toFixed(0)}ms)`);
if (second.ms > 500) {
  console.warn("WARN: cached hit still >500ms — check warm / cache");
  process.exit(1);
}
console.log("PASS — display cache serving pre-sized stock bytes.");
