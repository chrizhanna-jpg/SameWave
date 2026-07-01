import "./loadEnv";
import app from "./app";
import { logger } from "./lib/logger";
import { startPhotoRetentionCleanup } from "./lib/photoRetentionCleanup";
import { getPhotoRetentionDays } from "./lib/photoRetention";
import { getAndroidLatestDebugInfo } from "./androidLatest";
import { warmStockDisplayCache } from "./lib/warmStockDisplayCache";
import { startDeckEncodeBackfill } from "./lib/deckEncodeBackfill";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/** Default IPv4-any so phones on `http://192.168.x.x:PORT` reach this host on Windows. */
const listenHost = process.env["LISTEN_HOST"]?.trim() || "0.0.0.0";

const server = app.listen(port, listenHost, () => {
  const androidLatest = getAndroidLatestDebugInfo();
  logger.info(
    {
      port,
      listenHost,
      photoRetentionDays: getPhotoRetentionDays(),
      androidLatestVersionCode: androidLatest.resolved.latestVersionCode,
      androidLatestVersionName: androidLatest.resolved.latestVersionName,
      androidLatestUsingDefaults: androidLatest.usingDefaults,
    },
    "Server listening",
  );
  if (androidLatest.usingDefaults) {
    logger.warn(
      {
        bundledConfigLoaded: androidLatest.bundledConfigLoaded,
        envVersionCode: androidLatest.envVersionCode,
        fileVersionCode: androidLatest.fileVersionCode,
      },
      "android latest config fell back to defaults — set ANDROID_LATEST_VERSION_CODE on Render",
    );
  }
  startPhotoRetentionCleanup();
  // Background: pre-resize the curated stock pool so the bulk of the matching
  // deck streams from memory instead of paying a per-card DB read + sharp.
  warmStockDisplayCache();
  startDeckEncodeBackfill();
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});
