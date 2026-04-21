import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { registerPushToken } from "@/utils/api";
import { useToast } from "@/components/ToastHost";

// Foreground display behaviour. We surface foreground notifications via
// our own in-app toast (see ToastHost) instead of the OS banner, which
// feels intrusive when the user is already inside the app. We still let
// the OS keep the entry in the notification list, play the sound, and
// bump the badge so behaviour is identical to a backgrounded delivery
// minus the visible banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Map a notification's `data.deepLink` into an in-app navigation. The
// server sends `/echoes` for both pending and mutual events; if we ever
// add a per-pair deep link we can branch here.
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
  // Only physical devices can get an Expo push token; emulators and the
  // web preview return null and we just skip registration.
  if (!Device.isDevice) return null;

  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync("echoes", {
        name: "Echoes",
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
 */
export function usePushNotifications() {
  const responseSub = useRef<Notifications.Subscription | null>(null);
  const receivedSub = useRef<Notifications.Subscription | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;

    (async () => {
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
    responseSub.current = Notifications.addNotificationResponseReceivedListener(
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
    receivedSub.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        const content = notification.request.content;
        const data = content.data as Record<string, unknown> | undefined;
        const title = content.title ?? undefined;
        const body =
          content.body ?? "Someone just echoed your photo — tap to view.";
        showToast({
          title,
          body,
          onPress: () => navigateFromData(data),
        });
      },
    );

    // Cold-start tap: app was killed and the user opened it FROM a
    // notification. The response is captured before any listener is
    // attached, so we have to read it explicitly. Defer slightly so
    // expo-router's root navigator has mounted before we navigate.
    (async () => {
      try {
        const last = await Notifications.getLastNotificationResponseAsync();
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
