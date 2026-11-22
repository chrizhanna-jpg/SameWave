/**
 * Where a photo's capture country came from.
 * - gps: live device location at camera capture (`countryHere`)
 * - photo: gallery EXIF / picker coordinates (`countryAt`)
 * - fallback: profile home country when neither GPS nor photo coords resolve
 */
export type CaptureCountrySource = "gps" | "photo" | "fallback";

export function isApproximateCountrySource(
  source: CaptureCountrySource | null | undefined,
): boolean {
  return source === "fallback";
}

/**
 * Resolve capture country + provenance for a Ripple about to upload.
 * Camera → gps when reverse-geocode succeeds; gallery with coords → photo;
 * otherwise the profile home country as fallback.
 */
export function resolveCaptureCountry(input: {
  photoSource: "camera" | "library" | string;
  hasCoords: boolean;
  /** Country from GPS / EXIF reverse-geocode, when known. */
  locatedCountryCode: string | null;
  /** Profile home country. */
  homeCountryCode: string | null;
}): { captureCountryCode: string | null; captureCountrySource: CaptureCountrySource } {
  const located = input.locatedCountryCode;
  if (located) {
    const fromCamera = input.photoSource === "camera";
    const fromPhoto = input.hasCoords && input.photoSource !== "camera";
    return {
      captureCountryCode: located,
      captureCountrySource: fromCamera ? "gps" : fromPhoto ? "photo" : "gps",
    };
  }
  return {
    captureCountryCode: input.homeCountryCode,
    captureCountrySource: "fallback",
  };
}

/** Normalise a stored / wire value; unknown strings become null. */
export function parseCaptureCountrySource(
  value: unknown,
): CaptureCountrySource | null {
  if (value === "gps" || value === "photo" || value === "fallback") return value;
  return null;
}
