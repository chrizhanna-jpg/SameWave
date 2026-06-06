import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import { registerPushToken } from "@/utils/api";
import { useToast } from "@/components/ToastHost";
import {
  getCelebratedEchoIdsSync,
  hydrateCelebratedEchoIds,
  shouldSuppressEchoNotification,
} from "@/utils/syncCache";
// Type-only import — never loads the native module at runtime, so it
// can't trigger the Expo Go SDK 53 "remote push removed" exception.
import type * as NotificationsType from "expo-notifications";

// Expo Go (SDK 53+) stripped out remote-push support. Even *importing*
// `expo-notifications` triggers a synchronous native exception there,
// which previously cascaded into a root-layout crash. We detect the
// runtime up front and only `require()` the module on real
// dev/production builds. Two flags so we catch both legacy and
// current Expo runtime indicators.
const IS_EXPO_GO =
  Constants.appOwnership === "expo" ||
  Constants.executionEnvironment === "storeClient";

let Notifications: typeof NotificationsType | null = null;
if (!IS_EXPO_GO) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require("expo-notifications") as typeof NotificationsType;
  } catch {
    Notifications = null;
  }
}

let Device: typeof import("expo-device") | null = null;
if (!IS_EXPO_GO) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Device = require("expo-device") as typeof import("expo-device");
  } catch {
    Device = null;
  }
}

// Foreground display behaviour. We surface foreground notifications via
// our own in-app toast (see ToastHost) instead of the OS banner, which
// feels intrusive when the user is already inside the app. We still let
// the OS keep the entry in the notification list, play the sound, and
// bump the badge so behaviour is identical to a backgrounded delivery
// minus the visible banner.
if (Notifications) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch {
    // Some environments (web, SSR) can't set the handler; the hook
    // itself still no-ops below if anything goes wrong.
  }
}

// Map a notification's `data.deepLink` into an in-app navigation. The
// server sends `/echoes` for pending offers and `/echo-pair?a=&b=` for
// mutual matches.
function navigateFromData(data: Record<string, unknown> | undefined) {
  if (!data) return;
  const deepLink = typeof data.deepLink === "string" ? data.deepLink : null;
  if (!deepLink) return;
  try {
    if (deepLink === "/echoes") {
      router.push("/echoes");
    } else if (deepLink.startsWith("/echo-pair")) {
      router.push(deepLink as never);
    } else if (deepLink.startsWith("/")) {
      router.push(deepLink as never);
    }
  } catch {
    // Router not ready yet — silently drop. The notification system
    // also exposes getLastNotificationResponseAsync for cold-start
    // taps; we handle that below.
  }
}

async function registerForPushAsync(): Promise<string | null> {
  if (!Notifications || !Device) return null;
  // Only physical devices can get an Expo push token; emulators and
  // the web preview return null and we just skip registration.
  if (!Device.isDevice) return null;

  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync("echoes", {
        name: "Waves",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF7AA2",
      });
    } catch {}
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") return null;

  // EAS / Expo Go both stash the projectId on Constants. Without it the
  // call will throw on a development build, so we feed it through
  // explicitly when available.
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
      ?.eas?.projectId ||
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId;

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return tokenData?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Wires up the device for push delivery:
 *   1. Asks for permission (no-op if already decided).
 *   2. Fetches the Expo push token and POSTs it to the API server.
 *   3. Subscribes to notification taps and deep-links into the app.
 *   4. Handles a cold-start tap (app launched FROM a notification).
 *
 * Safe to call once at the root. All side effects are idempotent.
 * In Expo Go the entire hook is a no-op.
 */
export function usePushNotifications() {
  const responseSub = useRef<NotificationsType.Subscription | null>(null);
  const receivedSub = useRef<NotificationsType.Subscription | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    // Expo Go can't subscribe to remote pushes — bail.
    if (!Notifications) return;
    const N = Notifications;
    let cancelled = false;

    (async () => {
      await hydrateCelebratedEchoIds();
      const token = await registerForPushAsync();
      if (cancelled || !token) return;
      const platform: "ios" | "android" | "web" =
        Platform.OS === "ios"
          ? "ios"
          : Platform.OS === "android"
          ? "android"
          : "web";
      await registerPushToken({ token, platform });
    })();

    // Tap on a notification while the app is foregrounded or
    // backgrounded → deep link.
    responseSub.current = N.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | Record<string, unknown>
          | undefined;
        navigateFromData(data);
      },
    );

    // A notification arrived while the app is foregrounded. The OS
    // banner is suppressed (see setNotificationHandler above) so we show
    // our own in-app toast that deep-links the same way the push tap
    // would.
    receivedSub.current = N.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      const data = content.data as Record<string, unknown> | undefined;
      const celebratedIds = getCelebratedEchoIdsSync();
      if (shouldSuppressEchoNotification(data, celebratedIds)) return;
      // The toast is a one-of-a-kind surface reserved for the echo
      // loop, so the title is always branded with the word "Echo"
      // (mutual vs incoming offer) regardless of the server-side copy.
      const state = typeof data?.state === "string" ? data.state : null;
      const brandedTitle =
        state === "mutual" ? "Wave! ✨" : "A new ripple 💫";
      const body =
        content.body ?? "Someone just rippled your photo — tap to view.";
      showToast({
        title: brandedTitle,
        body,
        onPress: () => navigateFromData(data),
      });
    });

    // Cold-start tap: app was killed and the user opened it FROM a
    // notification. The response is captured before any listener is
    // attached, so we have to read it explicitly. Defer slightly so
    // expo-router's root navigator has mounted before we navigate.
    (async () => {
      try {
        const last = await N.getLastNotificationResponseAsync();
        if (cancelled || !last) return;
        const data = last.notification.request.content.data as
          | Record<string, unknown>
          | undefined;
        // 250ms is enough on every device we've tried for the root
        // <Stack> to be ready to receive a push().
        setTimeout(() => navigateFromData(data), 250);
      } catch {}
    })();

    return () => {
      cancelled = true;
      responseSub.current?.remove();
      responseSub.current = null;
      receivedSub.current?.remove();
      receivedSub.current = null;
    };
  }, [showToast]);
}
