/**
 * Push notifications. The server sends them; the app's part is to ask for
 * permission at the right moment (after the first Ripple, never on first
 * launch), hand the server this phone's address, and open the right Wave
 * when a notification is tapped.
 *
 * Expo Go cannot receive remote pushes, so the native module is never
 * loaded there and every function becomes a no-op.
 */
import type * as NotificationsModule from "expo-notifications";
import { Platform } from "react-native";

import { easProjectId, IS_EXPO_GO } from "@/config/env";
import { colors } from "@/theme";

type Notifications = typeof NotificationsModule;

let notifications: Notifications | null = null;
if (!IS_EXPO_GO && Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    notifications = require("expo-notifications") as Notifications;
  } catch {
    notifications = null;
  }
}

/** Channel id the server addresses on Android. Shown to the user as "Waves". */
const CHANNEL_ID = "echoes";

export const pushSupported = notifications !== null;

export type PushPermission = "granted" | "denied" | "undetermined" | "unsupported";

/**
 * While the app is open a Wave is announced on screen, so the system banner
 * is not shown as well.
 */
export function configureForegroundPushes(): void {
  if (!notifications) return;
  try {
    notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // The default handling is acceptable.
  }
}

export async function pushPermission(): Promise<PushPermission> {
  if (!notifications) return "unsupported";
  try {
    const current = await notifications.getPermissionsAsync();
    if (current.granted) return "granted";
    return current.canAskAgain ? "undetermined" : "denied";
  } catch {
    return "unsupported";
  }
}

async function pushAddress(): Promise<string | null> {
  if (!notifications) return null;
  if (Platform.OS === "android") {
    try {
      await notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Waves",
        importance: notifications.AndroidImportance.DEFAULT,
        lightColor: colors.moon,
      });
    } catch {
      // The server's notifications fall back to the default channel.
    }
  }
  try {
    const projectId = easProjectId();
    const token = await notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data || null;
  } catch {
    return null;
  }
}

/**
 * Returns this phone's push address, or null when notifications are off.
 * With `ask` false the system prompt is never shown: the address is only
 * returned if the user has already said yes.
 */
export async function enablePushes(options: { ask: boolean }): Promise<string | null> {
  if (!notifications) return null;
  try {
    let permission = await notifications.getPermissionsAsync();
    if (!permission.granted && options.ask && permission.canAskAgain) {
      permission = await notifications.requestPermissionsAsync();
    }
    if (!permission.granted) return null;
    return await pushAddress();
  } catch {
    return null;
  }
}

/** The two photos named by a notification about a Wave, when it names them. */
export interface PushTarget {
  photoA: string | null;
  photoB: string | null;
}

function targetFrom(data: unknown): PushTarget {
  const link =
    data && typeof data === "object" && typeof (data as { deepLink?: unknown }).deepLink === "string"
      ? ((data as { deepLink: string }).deepLink)
      : "";
  const query = link.includes("?") ? link.slice(link.indexOf("?") + 1) : "";
  const params = new Map(
    query
      .split("&")
      .map((pair) => pair.split("=") as [string, string | undefined])
      .filter(([key]) => key),
  );
  const read = (key: string) => {
    const value = params.get(key);
    return value ? decodeURIComponent(value) : null;
  };
  return { photoA: read("a"), photoB: read("b") };
}

/**
 * Calls `onArrive` when a notification lands while the app is open, and
 * `onOpen` when the user taps one (including the tap that launched the app).
 * Returns a function that stops listening.
 */
export function listenForPushes(handlers: {
  onArrive: () => void;
  onOpen: (target: PushTarget) => void;
}): () => void {
  const module = notifications;
  if (!module) return () => undefined;
  let active = true;
  const arrived = module.addNotificationReceivedListener(() => handlers.onArrive());
  const opened = module.addNotificationResponseReceivedListener((response) => {
    handlers.onOpen(targetFrom(response.notification.request.content.data));
  });
  void (async () => {
    try {
      const last = await module.getLastNotificationResponseAsync();
      if (!active || !last) return;
      await module.clearLastNotificationResponseAsync().catch(() => undefined);
      handlers.onOpen(targetFrom(last.notification.request.content.data));
    } catch {
      // No launch notification.
    }
  })();
  return () => {
    active = false;
    arrived.remove();
    opened.remove();
  };
}
