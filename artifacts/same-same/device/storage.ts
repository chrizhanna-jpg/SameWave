/**
 * Small values the app keeps on the device. Photos are never stored here:
 * Android limits each entry to about 2 MB.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "sw2";

/** Keys the previous app wrote. Read once to carry things over, never written. */
export const LEGACY_KEYS = {
  state: "samesame_state",
  deviceId: "samesame_device_id",
} as const;

export function accountKey(accountId: string, name: string): string {
  return `${PREFIX}:${accountId}:${name}`;
}

export function deviceKey(name: string): string {
  return `${PREFIX}:device:${name}`;
}

export async function readText(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function writeText(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // The value stays in memory for this session and is written again on the next change.
  }
}

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await readText(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  await writeText(key, JSON.stringify(value));
}

export async function removeKeys(keys: string[]): Promise<void> {
  try {
    await AsyncStorage.multiRemove(keys);
  } catch {
    // Nothing useful to do; the keys are overwritten on next use.
  }
}

/** The id the previous app sent with every request, if this device has one. */
export async function legacyDeviceId(): Promise<string | null> {
  const id = await readText(LEGACY_KEYS.deviceId);
  return id && /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : null;
}
