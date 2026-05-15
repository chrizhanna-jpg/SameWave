/**
 * Debug-mode NDJSON ingest. Cursor's ingest at 127.0.0.1 is unreachable from a
 * physical device; in `__DEV__` we mirror payloads to Metro (`console.warn`)
 * and POST to localhost :7459 from simulators / dev machines only.
 * LAN duplicate POSTs to :7459 use `lanIngestUrls()` when `getPublicApiOrigin()`
 * is HTTP on a non-localhost host.
 */

import { getPublicApiOrigin } from "@/utils/publicEnv";

const INGEST_PATH =
  "/ingest/e158d8b6-c760-48c9-b31a-14c8f7f50975";

const SESSION_ID = "ac992e";

const LOCAL_INGEST = `http://127.0.0.1:7459${INGEST_PATH}`;

function lanIngestUrls(): string[] {
  const out: string[] = [];
  const custom = process.env.EXPO_PUBLIC_DEBUG_INGEST_ORIGIN?.trim();
  if (custom) {
    const base = custom.replace(/\/+$/, "");
    out.push(base.endsWith(INGEST_PATH) ? base : `${base}${INGEST_PATH}`);
  }
  if (!__DEV__) return out;
  try {
    const api = getPublicApiOrigin();
    const u = new URL(api.startsWith("http") ? api : `https://${api}`);
    if (u.protocol !== "http:") return out;
    if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return out;
    if (/onrender|ngrok|expo\.dev/i.test(u.hostname)) return out;
    u.port = "7459";
    out.push(`${u.origin}${INGEST_PATH}`);
  } catch {
    /* ignore */
  }
  return out;
}

export function postDebugSessionLog(entry: {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  runId?: string;
}): void {
  const payload = {
    sessionId: SESSION_ID,
    ...entry,
    timestamp: Date.now(),
  };
  const body = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json",
    "X-Debug-Session-Id": SESSION_ID,
  } as const;

  if (__DEV__) {
    console.warn("[debug-ac992e]", body);
    void fetch(LOCAL_INGEST, { method: "POST", headers, body }).catch(() => {});
  }

  for (const url of lanIngestUrls()) {
    void fetch(url, { method: "POST", headers, body }).catch(() => {});
  }
}
