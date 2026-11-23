/**
 * In-app notification preference — separate from OS permission.
 * When Off, the app does not register tokens, schedule local Wave
 * notifications, or treat pushes as wanted — even if OS permission is On.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "samewave.notifications.enabled.v1";

/** Default On so existing installs keep receiving until the person opts out. */
export async function readNotificationsEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return true;
    return raw !== "0";
  } catch {
    return true;
  }
}

export async function writeNotificationsEnabled(on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* keep going */
  }
}
