// Best-effort GPS → ISO country code lookup. Used at onboarding to
// suggest a country pre-fill, at in-app camera shutter (device GPS),
// and for library picks (GPS embedded in photo EXIF). Always
// best-effort: denied permission, missing EXIF, flaky fix, or web
// preview silently returns null and the caller shows Somewhere / 🌍.

import * as Location from "expo-location";
import { Platform } from "react-native";

export interface DetectedCountry {
  code: string; // ISO 3166-1 alpha-2, uppercase (e.g. "GB", "US")
  name?: string;
}

function applyHemisphereRef(decimal: number, ref: unknown): number | null {
  if (!Number.isFinite(decimal)) return null;
  const r = String(ref ?? "")
    .trim()
    .toUpperCase();
  if (r === "S" || r === "W") return -Math.abs(decimal);
  if (r === "N" || r === "E") return Math.abs(decimal);
  return decimal;
}

/** Convert EXIF DMS array [deg, min, sec] or a plain decimal to signed degrees. */
function exifCoordToDecimal(value: unknown, ref: unknown): number | null {
  if (typeof value === "number") {
    return applyHemisphereRef(value, ref);
  }
  if (Array.isArray(value) && value.length >= 3) {
    const [d, m, s] = value.map((v) => Number(v));
    if (![d, m, s].every(Number.isFinite)) return null;
    const decimal = d + m / 60 + s / 3600;
    return applyHemisphereRef(decimal, ref);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return applyHemisphereRef(n, ref);
  }
  return null;
}

function readExifField(
  exif: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const k of keys) {
    const v = exif[k];
    if (v != null && v !== "") return v;
  }
  return undefined;
}

/** Parse latitude/longitude from expo-image-picker EXIF (iOS + Android shapes). */
export function parseCoordinatesFromPhotoExif(
  exif: Record<string, unknown> | null | undefined,
): { latitude: number; longitude: number } | null {
  if (!exif || typeof exif !== "object") return null;

  const gpsBlock = readExifField(exif, "GPS", "{GPS}");
  const gps =
    gpsBlock && typeof gpsBlock === "object"
      ? (gpsBlock as Record<string, unknown>)
      : exif;

  const latRaw = readExifField(
    gps,
    "Latitude",
    "GPSLatitude",
    "latitude",
  );
  const lonRaw = readExifField(
    gps,
    "Longitude",
    "GPSLongitude",
    "longitude",
  );
  const latRef = readExifField(gps, "LatitudeRef", "GPSLatitudeRef");
  const lonRef = readExifField(gps, "LongitudeRef", "GPSLongitudeRef");

  const latitude = exifCoordToDecimal(latRaw, latRef);
  const longitude = exifCoordToDecimal(lonRaw, lonRef);

  if (latitude == null || longitude == null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }
  return { latitude, longitude };
}

/**
 * Reverse-geocode coordinates into an ISO country code. Does not require
 * a live device GPS fix — only network/platform geocoder access.
 */
export async function detectCountryFromCoordinates(
  latitude: number,
  longitude: number,
): Promise<DetectedCountry | null> {
  if (Platform.OS === "web") return null;
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude,
      longitude,
    });
    const hit = results.find((r) => r.isoCountryCode);
    if (!hit?.isoCountryCode) return null;
    return {
      code: hit.isoCountryCode.toUpperCase(),
      name: hit.country ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Read embedded photo GPS from library-pick EXIF and reverse-geocode to ISO2.
 * Returns null when EXIF has no coordinates or geocoding fails.
 */
export async function detectCountryFromPhotoExif(
  exif: Record<string, unknown> | null | undefined,
): Promise<DetectedCountry | null> {
  if (Platform.OS === "web") return null;
  const coords = parseCoordinatesFromPhotoExif(exif);
  if (!coords) return null;
  return detectCountryFromCoordinates(coords.latitude, coords.longitude);
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
  if (Platform.OS === "web") return null;

  try {
    const work = (async (): Promise<DetectedCountry | null> => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return null;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Lowest,
      });
      return detectCountryFromCoordinates(
        pos.coords.latitude,
        pos.coords.longitude,
      );
    })();

    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    });

    return await Promise.race([work, timeout]);
  } catch {
    return null;
  }
}
