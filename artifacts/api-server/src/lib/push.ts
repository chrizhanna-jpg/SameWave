import { db, pushTokensTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger";

// Expo Push API endpoint. Accepts up to 100 messages per call.
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface PushPayload {
  title: string;
  body: string;
  // Arbitrary JSON delivered to the client. We use it for deep-linking —
  // the mobile app reads `data.deepLink` from the notification response.
  data?: Record<string, unknown>;
}

interface ExpoMessage extends PushPayload {
  to: string;
  sound?: "default" | null;
  channelId?: string;
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Look up every Expo push token registered for a user (they may have
 * more than one device) and fire a notification at all of them in a
 * single Expo Push API call.
 *
 * Failures are logged but never thrown — push is a best-effort side
 * effect of the echo flow and must not break the underlying request.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!userId) return;
  let rows: { id: string; expoToken: string }[] = [];
  try {
    rows = await db
      .select({ id: pushTokensTable.id, expoToken: pushTokensTable.expoToken })
      .from(pushTokensTable)
      .where(eq(pushTokensTable.userId, userId));
  } catch (err) {
    logger.error({ err, userId }, "push token lookup failed");
    return;
  }
  if (rows.length === 0) return;
  await sendPushToTokens(
    rows.map((r) => r.expoToken),
    payload,
  );
}

export async function sendPushToTokens(
  tokens: string[],
  payload: PushPayload,
): Promise<void> {
  // Filter to syntactically valid Expo push tokens. Anything else (an
  // FCM/APNS token registered before the project was set up, a stale
  // string from a wiped install) is dropped silently.
  const valid = tokens.filter(
    (t) => typeof t === "string" && /^Expo(?:nent)?PushToken\[/.test(t),
  );
  if (valid.length === 0) return;

  const messages: ExpoMessage[] = valid.map((to) => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    channelId: "echoes",
  }));

  let res: Response;
  try {
    res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    logger.error({ err }, "expo push send network error");
    return;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.error({ status: res.status, text }, "expo push send non-2xx");
    return;
  }

  // Reap dead tokens. Expo returns "DeviceNotRegistered" when the
  // recipient has uninstalled or signed out of expo notifications. We
  // remove those rows so we don't keep paying the round-trip on every
  // future echo. Other error codes (rate limits, bad JSON, etc.) we
  // leave alone — they're transient or our own bug.
  try {
    const json = (await res.json()) as { data?: ExpoTicket[] };
    const tickets = Array.isArray(json.data) ? json.data : [];
    const dead: string[] = [];
    tickets.forEach((t, i) => {
      if (t.status === "error" && t.details?.error === "DeviceNotRegistered") {
        const tok = valid[i];
        if (tok) dead.push(tok);
      }
    });
    if (dead.length > 0) {
      await db
        .delete(pushTokensTable)
        .where(inArray(pushTokensTable.expoToken, dead));
    }
  } catch (err) {
    logger.error({ err }, "expo push response parse failed");
  }
}
