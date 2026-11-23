/**
 * Validate capture-country provenance from the client.
 * Unknown / missing values become null (DB nullable; clients treat null as fallback).
 */
export type CaptureCountrySource = "gps" | "photo" | "fallback";

const ALLOWED = new Set<CaptureCountrySource>(["gps", "photo", "fallback"]);

export function parseCaptureCountrySource(
  value: unknown,
): CaptureCountrySource | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return ALLOWED.has(v as CaptureCountrySource)
    ? (v as CaptureCountrySource)
    : null;
}
