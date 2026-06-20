import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { AppState, Platform } from "react-native";

import { getPublicApiOrigin } from "@/utils/publicEnv";

const DISMISSED_KEY = "samesame_dismissed_update_vc";

const DEFAULT_PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=echo.samewaveripple.app";

/** Dev-only: force update modal/banner in Expo Go (any platform). */
export function isUpdatePreviewMode(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_PREVIEW_UPDATE_UI === "1";
}

export type AppUpdateInfo = {
  latestVersionCode: number;
  latestVersionName: string;
  playStoreUrl: string;
  /** Optional server-provided copy for the update prompt. */
  updateMessage?: string;
};

export function getInstalledAndroidVersionCode(): number | null {
  if (isUpdatePreviewMode()) return 1;
  if (Platform.OS !== "android") return null;
  const vc = Constants.expoConfig?.android?.versionCode;
  return typeof vc === "number" && Number.isFinite(vc) ? vc : null;
}

export async function fetchAppUpdateInfo(): Promise<AppUpdateInfo | null> {
  if (Platform.OS !== "android" && !isUpdatePreviewMode()) return null;
  try {
    const base = getPublicApiOrigin();
    const res = await fetch(`${base}/api/public/app-config`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      android?: {
        latestVersionCode?: unknown;
        latestVersionName?: unknown;
        playStoreUrl?: unknown;
        updateMessage?: unknown;
      };
    };
    const rawCode = json.android?.latestVersionCode;
    const latestVersionCode =
      typeof rawCode === "number" && Number.isFinite(rawCode)
        ? Math.round(rawCode)
        : null;
    if (latestVersionCode == null || latestVersionCode <= 0) return null;
    const latestVersionName =
      typeof json.android?.latestVersionName === "string" &&
      json.android.latestVersionName.trim().length > 0
        ? json.android.latestVersionName.trim()
        : String(latestVersionCode);
    const playStoreUrl =
      typeof json.android?.playStoreUrl === "string" &&
      json.android.playStoreUrl.trim().length > 0
        ? json.android.playStoreUrl.trim()
        : DEFAULT_PLAY_STORE_URL;
    const updateMessage =
      typeof json.android?.updateMessage === "string" &&
      json.android.updateMessage.trim().length > 0
        ? json.android.updateMessage.trim()
        : undefined;
    return { latestVersionCode, latestVersionName, playStoreUrl, updateMessage };
  } catch {
    return null;
  }
}

export async function getDismissedUpdateVersionCode(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.round(n) : null;
  } catch {
    return null;
  }
}

export async function dismissUpdateBanner(latestVersionCode: number): Promise<void> {
  try {
    await AsyncStorage.setItem(DISMISSED_KEY, String(latestVersionCode));
  } catch {
    // Best-effort — banner may reappear next session.
  }
}

export async function shouldShowUpdateBanner(): Promise<{
  show: boolean;
  info: AppUpdateInfo | null;
}> {
  const installed = getInstalledAndroidVersionCode();
  if (installed == null) return { show: false, info: null };

  const info = await fetchAppUpdateInfo();
  if (!info || info.latestVersionCode <= installed) {
    return { show: false, info };
  }

  const dismissed = await getDismissedUpdateVersionCode();
  if (
    !isUpdatePreviewMode() &&
    dismissed != null &&
    dismissed >= info.latestVersionCode
  ) {
    return { show: false, info };
  }

  return { show: true, info };
}

/** Re-check when the app returns to the foreground. */
export function onAppForeground(fn: () => void): () => void {
  const sub = AppState.addEventListener("change", (state) => {
    if (state === "active") fn();
  });
  return () => sub.remove();
}
