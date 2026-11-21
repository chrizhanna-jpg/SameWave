/**
 * Which country a photo was taken in. Always optional: when the phone will
 * not say, the photo travels with the user's chosen country instead.
 */
import * as Location from "expo-location";
import { Platform } from "react-native";

import { normalizeCountryCode } from "@/data/countries";

const FIX_TIMEOUT_MS = 6000;

function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function countryAt(coords: {
  latitude: number;
  longitude: number;
}): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const places = await within(Location.reverseGeocodeAsync(coords), FIX_TIMEOUT_MS);
    const hit = places?.find((place) => place.isoCountryCode);
    return normalizeCountryCode(hit?.isoCountryCode);
  } catch {
    return null;
  }
}

/**
 * The country the phone is in now, for a photo taken with the camera.
 * Asks for location permission the first time; a "no" is respected and
 * simply means the chosen country is used.
 */
export async function countryHere(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (!permission.granted) return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60 * 1000 });
    const position =
      last ??
      (await within(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }),
        FIX_TIMEOUT_MS,
      ));
    if (!position) return null;
    return countryAt(position.coords);
  } catch {
    return null;
  }
}

/** A first guess for the country picker, from the phone's region setting. */
export function countryFromLocale(): string | null {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = locale.match(/[-_]([A-Za-z]{2})\b/)?.[1];
    return normalizeCountryCode(region);
  } catch {
    return null;
  }
}
