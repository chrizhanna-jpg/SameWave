/** Debug session c4a416 — NDJSON ingest for Sent-tab yours photo investigation. */
const INGEST =
  "http://127.0.0.1:7834/ingest/6ca99c11-41ee-4912-b3fd-4eb84885a983";
const SESSION_ID = "c4a416";

export function debugLogC416(entry: {
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
    console.warn("[debug-c4a416]", body);
  }

  void fetch(INGEST, { method: "POST", headers, body }).catch(() => {});

  try {
    const { getPublicApiOrigin } = require("@/utils/publicEnv") as typeof import("@/utils/publicEnv");
    const api = getPublicApiOrigin();
    const u = new URL(api.startsWith("http") ? api : `http://${api}`);
    if (
      u.protocol === "http:" &&
      u.hostname !== "127.0.0.1" &&
      u.hostname !== "localhost" &&
      !/onrender|ngrok|expo\.dev/i.test(u.hostname)
    ) {
      u.port = "7834";
      void fetch(`${u.origin}/ingest/6ca99c11-41ee-4912-b3fd-4eb84885a983`, {
        method: "POST",
        headers,
        body,
      }).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}
