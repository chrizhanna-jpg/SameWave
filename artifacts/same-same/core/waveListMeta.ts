import { isApproximateCountrySource, type CaptureCountrySource } from "./captureCountry";
import { nameFor } from "../data/countries";

/**
 * Readable place for a Waves list row: full country name when known.
 * City is preferred when a name is supplied — except for fallback (approx)
 * sides, which must never show a precise city.
 */
export function waveListPlace(opts: {
  countryCode?: string | null;
  city?: string | null;
  countrySource?: CaptureCountrySource | null;
  approximate?: boolean;
}): string {
  const approx =
    opts.approximate === true || isApproximateCountrySource(opts.countrySource);
  const city = approx ? "" : opts.city?.trim();
  if (city) return city;
  return nameFor(opts.countryCode) ?? "Somewhere";
}

/**
 * Device-locale date for a Wave list row (e.g. en-GB → "15 Jun, 11:00").
 */
export function waveListWhen(
  iso: string | null | undefined,
  locale?: string | string[],
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleString(locale, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}
