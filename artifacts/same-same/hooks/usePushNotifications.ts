import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import { registerPushToken } from "@/utils/api";
import { useToast } from "@/components/ToastHost";
import {
  PUSH_ACTION,
  PUSH_CATEGORY,
  PUSH_COPY,
} from "@/data/waveRippleGlossary";
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

async function registerNotificationCategories(
  N: typeof NotificationsType,
): Promise<void> {
  try {
    await N.setNotificationCategoryAsync(PUSH_CATEGORY.rippleIncoming, [
      {
        identifier: PUSH_ACTION.makeWave,
        buttonTitle: PUSH_COPY.pending.actionLabel,
        options: { opensAppToForeground: true },
      },
    ]);
    await N.setNotificationCategoryAsync(PUSH_CATEGORY.waveMutual, [
      {
        identifier: PUSH_ACTION.viewWave,
        buttonTitle: PUSH_COPY.mutual.actionLabel,
        options: { opensAppToForeground: true },
      },
    ]);
  } catch {
    // Categories are optional on unsupported platforms.
  }
}

function navigateToEchoes(focusEchoId?: string) {
  try {
    if (focusEchoId) {
      router.push({
        pathname: "/echoes",
        params: { focus: focusEchoId },
      });
    } else {
      router.push("/echoes");
    }
  } catch {
    // Router not ready.
  }
}

function navigateToWaveReveal(deepLink: string) {
  try {
    if (deepLink.startsWith("/echo-pair")) {
      const celebrateLink = deepLink.includes("?")
        ? `${deepLink}&celebrate=1`
        : `${deepLink}?celebrate=1`;
      router.push(celebrateLink as never);
    } else if (deepLink.startsWith("/")) {
      router.push(deepLink as never);
    }
  } catch {
    // Router not ready.
  }
}

/** Map notification data + optional action button into navigation. */
function navigateFromNotification(
  data: Record<string, unknown> | undefined,
  actionIdentifier?: string,
) {
  if (!data) return;
  const state = typeof data.state === "string" ? data.state : null;
  const deepLink = typeof data.deepLink === "string" ? data.deepLink : null;
  const echoId = typeof data.echoId === "string" ? data.echoId : undefined;

  if (
    state === "pending" ||
    actionIdentifier === PUSH_ACTION.makeWave
  ) {
    navigateToEchoes(echoId);
    return;
  }

  if (
    state === "mutual" ||
    actionIdentifier === PUSH_ACTION.viewWave
  ) {
    if (deepLink) navigateToWaveReveal(deepLink);
    return;
  }

  if (deepLink === "/echoes") {
    navigateToEchoes(echoId);
  } else if (deepLink?.startsWith("/echo-pair")) {
    navigateToWaveReveal(deepLink);
  } else if (deepLink?.startsWith("/")) {
    try {
      router.push(deepLink as never);
    } catch {
      // Router not ready.
    }
  }
}

async function registerForPushAsync(): Promise<string | null> {
  if (!Notifications || !Device) return null;
  if (!Device.isDevice) return null;

  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync("echoes", {
        name: "Ripples & Waves",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FFD166",
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
    if (!Notifications) return;
    const N = Notifications;
    let cancelled = false;

    void registerNotificationCategories(N);

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

    responseSub.current = N.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | Record<string, unknown>
          | undefined;
        navigateFromNotification(data, response.actionIdentifier);
      },
    );

    receivedSub.current = N.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      const data = content.data as Record<string, unknown> | undefined;
      const state = typeof data?.state === "string" ? data.state : null;
      const echoId = typeof data?.echoId === "string" ? data.echoId : undefined;

      if (state === "mutual") {
        showToast({
          title: PUSH_COPY.mutual.title,
          body: content.body ?? PUSH_COPY.mutual.body,
          onPress: () => {
            const deepLink =
              typeof data?.deepLink === "string" ? data.deepLink : null;
            if (deepLink) navigateToWaveReveal(deepLink);
          },
          action: {
            label: PUSH_COPY.mutual.actionLabel,
            icon: "wave-glyph",
            onPress: () => {
              const deepLink =
                typeof data?.deepLink === "string" ? data.deepLink : null;
              if (deepLink) navigateToWaveReveal(deepLink);
            },
          },
          durationMs: 6000,
        });
        return;
      }

      showToast({
        title: PUSH_COPY.pending.title,
        body: content.body ?? PUSH_COPY.pending.body,
        onPress: () => navigateToEchoes(echoId),
        action: {
          label: PUSH_COPY.pending.actionLabel,
          icon: "wave-glyph",
          onPress: () => navigateToEchoes(echoId),
        },
        durationMs: 6000,
      });
    });

    (async () => {
      try {
        const last = await N.getLastNotificationResponseAsync();
        if (cancelled || !last) return;
        const data = last.notification.request.content.data as
          | Record<string, unknown>
          | undefined;
        setTimeout(
          () => navigateFromNotification(data, last.actionIdentifier),
          250,
        );
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
