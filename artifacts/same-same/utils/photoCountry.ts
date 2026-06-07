// Photo geography helpers. Capture country (GPS at in-app camera shutter)
// is the source of truth for display and geo ripples; profile / declared
// country on the photo row is fallback when capture is unknown.

import { flagFor, nameFor } from "@/data/countries";

/** ISO code to show — prefer capture, else declared (profile / library fallback). */
export function displayCountryCode(
  capture?: string | null,
  declared?: string | null,
): string | undefined {
  const c = capture?.trim().toUpperCase();
  if (c && c.length === 2) return c;
  const d = declared?.trim().toUpperCase();
  if (d && d.length === 2) return d;
  return undefined;
}

export type PhotoCountryDisplay = {
  code?: string;
  name: string;
  flag: string;
};

/** Flag + label for a photo card — capture first, declared fallback. */
export function photoCountryDisplay(
  capture?: string | null,
  declared?: string | null,
): PhotoCountryDisplay {
  const code = displayCountryCode(capture, declared);
  if (!code) {
    return { name: "Somewhere", flag: "🌍" };
  }
  return {
    code,
    name: nameFor(code) ?? "Somewhere",
    flag: flagFor(code),
  };
}
