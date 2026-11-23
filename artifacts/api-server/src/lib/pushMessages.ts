/**
 * Pure Expo Push message shaping + ticket pruning helpers.
 * Kept free of the database so unit tests can run without Neon.
 */

export const EXPO_WAVE_CHANNEL_ID = "waves";

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  categoryId?: string;
}

export interface ExpoMessage extends PushPayload {
  to: string;
  sound?: "default" | null;
  channelId?: string;
  categoryId?: string;
}

export interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/** Filter + shape Expo Push messages. */
export function buildExpoPushMessages(
  tokens: string[],
  payload: PushPayload,
): ExpoMessage[] {
  const valid = tokens.filter(
    (t) => typeof t === "string" && /^Expo(?:nent)?PushToken\[/.test(t),
  );
  return valid.map((to) => ({
    to,
    sound: "default" as const,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    channelId: EXPO_WAVE_CHANNEL_ID,
    ...(payload.categoryId ? { categoryId: payload.categoryId } : {}),
  }));
}

/**
 * Tokens Expo reported as DeviceNotRegistered (index-aligned with the
 * messages we sent).
 */
export function deadTokensFromTickets(
  tokens: string[],
  tickets: ExpoTicket[],
): string[] {
  const dead: string[] = [];
  tickets.forEach((t, i) => {
    if (t.status === "error" && t.details?.error === "DeviceNotRegistered") {
      const tok = tokens[i];
      if (tok) dead.push(tok);
    }
  });
  return dead;
}
