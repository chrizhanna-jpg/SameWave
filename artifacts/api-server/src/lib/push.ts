import { db, pushTokensTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger";
import {
  buildExpoPushMessages,
  deadTokensFromTickets,
  type PushPayload,
} from "./pushMessages";

export {
  buildExpoPushMessages,
  deadTokensFromTickets,
  EXPO_WAVE_CHANNEL_ID,
  type PushPayload,
} from "./pushMessages";

// Expo Push API endpoint. Accepts up to 100 messages per call.
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

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
  const messages = buildExpoPushMessages(tokens, payload);
  if (messages.length === 0) return;
  const valid = messages.map((m) => m.to);

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
    const json = (await res.json()) as {
      data?: { status: "ok" | "error"; details?: { error?: string } }[];
    };
    const tickets = Array.isArray(json.data) ? json.data : [];
    const dead = deadTokensFromTickets(valid, tickets);
    if (dead.length > 0) {
      await db
        .delete(pushTokensTable)
        .where(inArray(pushTokensTable.expoToken, dead));
    }
  } catch (err) {
    logger.error({ err }, "expo push response parse failed");
  }
}
