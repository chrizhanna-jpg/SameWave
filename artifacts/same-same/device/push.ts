/**
 * Push notifications. The server sends them; the app's part is to ask for
 * permission at the right moment (after the first Ripple, never on first
 * launch), hand the server this phone's address, and open the right Wave
 * when a notification is tapped.
 *
 * Expo Go cannot receive *remote* pushes on Android SDK 53+, but local
 * scheduled notifications still work there — used to test tap → Wave reveal
 * in preview. A development or production build is required for real remote push.
 */
import type * as NotificationsModule from "expo-notifications";
import { Platform } from "react-native";

import { easProjectId, IS_EXPO_GO } from "@/config/env";
import {
  targetFromNotificationData,
  type PushTarget,
} from "@/core/pushTarget";
import { colors } from "@/theme";

export { targetFromNotificationData, type PushTarget };

type Notifications = typeof NotificationsModule;

let notifications: Notifications | null = null;
if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    notifications = require("expo-notifications") as Notifications;
  } catch {
    notifications = null;
  }
}

/** Android channel id — keep in sync with api-server `channelId: "waves"`. */
export const ANDROID_WAVE_CHANNEL_ID = "waves";

export const pushSupported = notifications !== null;
/** True when remote Expo push tokens cannot be obtained (e.g. Expo Go). */
export const remotePushUnavailable = IS_EXPO_GO;

export type PushPermission = "granted" | "denied" | "undetermined" | "unsupported";

/**
 * While the app is open, WaveArrival / OpenWaveFromPush handles the reveal.
 * Still allow a quiet banner so a Wave isn't silent if sync is slow.
 */
export function configureForegroundPushes(): void {
  if (!notifications) return;
  try {
    notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
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

async function ensureAndroidChannel(): Promise<void> {
  if (!notifications || Platform.OS !== "android") return;
  try {
    await notifications.setNotificationChannelAsync(ANDROID_WAVE_CHANNEL_ID, {
      name: "Waves",
      importance: notifications.AndroidImportance.DEFAULT,
      lightColor: colors.moon,
      sound: "default",
    });
  } catch {
    // Server notifications fall back to the default channel.
  }
}

async function pushAddress(): Promise<string | null> {
  if (!notifications) return null;
  if (IS_EXPO_GO) return null;
  await ensureAndroidChannel();
  try {
    const projectId = easProjectId();
    const token = await notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data || null;
  } catch {
    return null;
  }
}

/**
 * Returns this phone's push address, or null when notifications are off /
 * Expo Go (no remote token). With `ask` false the system prompt is never shown.
 */
export async function enablePushes(options: { ask: boolean }): Promise<string | null> {
  if (!notifications) return null;
  try {
    let permission = await notifications.getPermissionsAsync();
    if (!permission.granted && options.ask && permission.canAskAgain) {
      permission = await notifications.requestPermissionsAsync();
    }
    if (!permission.granted) return null;
    await ensureAndroidChannel();
    return await pushAddress();
  } catch {
    return null;
  }
}

/**
 * Calls `onArrive` when a notification lands while the app is open, and
 * `onOpen` when the user taps one (including the tap that launched the app).
 * Returns a function that stops listening.
 */
export function listenForPushes(handlers: {
  onArrive: (target: PushTarget) => void;
  onOpen: (target: PushTarget) => void;
}): () => void {
  const module = notifications;
  if (!module) return () => undefined;
  let active = true;
  const arrived = module.addNotificationReceivedListener((notification) => {
    handlers.onArrive(targetFromNotificationData(notification.request.content.data));
  });
  const opened = module.addNotificationResponseReceivedListener((response) => {
    handlers.onOpen(targetFromNotificationData(response.notification.request.content.data));
  });
  void (async () => {
    try {
      const last = await module.getLastNotificationResponseAsync();
      if (!active || !last) return;
      await module.clearLastNotificationResponseAsync().catch(() => undefined);
      handlers.onOpen(targetFromNotificationData(last.notification.request.content.data));
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

/**
 * Schedules a local Wave notification (works in Expo Go) so tap-routing to
 * the full-screen reveal can be tested without a remote push / EAS build.
 * Returns the notification id, or null if unsupported.
 */
export async function scheduleLocalWaveNotification(options: {
  waveId: string;
  delaySeconds?: number;
  title?: string;
  body?: string;
}): Promise<string | null> {
  if (!notifications) return null;
  try {
    let permission = await notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await notifications.requestPermissionsAsync();
    }
    if (!permission.granted) return null;
    await ensureAndroidChannel();
    const waveId = options.waveId;
    const seconds = Math.max(1, options.delaySeconds ?? 3);
    return await notifications.scheduleNotificationAsync({
      content: {
        title: options.title ?? "Catch a Wave! ✨",
        body: options.body ?? "They rippled back!",
        data: {
          waveId,
          echoId: waveId,
          state: "mutual",
          reveal: "1",
          deepLink: `/wave/${encodeURIComponent(waveId)}?reveal=1`,
        },
        ...(Platform.OS === "android" ? { channelId: ANDROID_WAVE_CHANNEL_ID } : {}),
      },
      trigger: {
        type: notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        channelId: ANDROID_WAVE_CHANNEL_ID,
      },
    });
  } catch {
    return null;
  }
}
