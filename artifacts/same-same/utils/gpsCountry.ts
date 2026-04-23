// Best-effort GPS → ISO country code lookup. Used by onboarding to
// gently nudge the user if the country they picked doesn't match where
// their device thinks they are. Always best-effort: a denied permission,
// flaky GPS fix, or unsupported platform (web preview, simulator)
// silently returns null and the caller carries on with the user's
// manual choice.

import * as Location from "expo-location";
import { Platform } from "react-native";

export interface DetectedCountry {
  code: string; // ISO 3166-1 alpha-2, uppercase (e.g. "GB", "US")
  name?: string;
}

/**
 * Ask for location permission, take a single coarse GPS fix, and reverse
 * geocode it into a country. Returns null on any failure — the calling
 * code is expected to treat null as "we don't know, trust the user".
 *
 * The whole call is bounded by `timeoutMs` so a slow GPS fix can't
 * stall the onboarding flow indefinitely.
 */
export async function detectCountryFromGPS(
  timeoutMs = 8000,
): Promise<DetectedCountry | null> {
  // Web geolocation works but is fiddly across browsers and the
  // reverse-geocode side of expo-location isn't supported on web in all
  // SDK versions. Skip on web — the manual picker is good enough.
  if (Platform.OS === "web") return null;

  try {
    const work = (async (): Promise<DetectedCountry | null> => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return null;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Lowest,
      });
      const results = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const hit = results.find((r) => r.isoCountryCode);
      if (!hit || !hit.isoCountryCode) return null;
      return {
        code: hit.isoCountryCode.toUpperCase(),
        name: hit.country ?? undefined,
      };
    })();

    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    });

    return await Promise.race([work, timeout]);
  } catch {
    return null;
  }
}
