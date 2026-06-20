// Photo geography helpers. Live uploads use captureCountryCode only — GPS at
// in-app camera shutter or embedded EXIF on library picks. Curated stock
// photos resolve their demo country from sample metadata when capture is absent.

import { lookupSamplePhotoByUri } from "@/data/samplePhotos";
import { flagFor, nameFor } from "@/data/countries";

/** ISO code from verified capture GPS only. */
export function displayCountryCode(
  capture?: string | null,
): string | undefined {
  const c = capture?.trim().toUpperCase();
  if (c && c.length === 2) return c;
  return undefined;
}

export type PhotoCountryDisplay = {
  code?: string;
  name: string;
  flag: string;
};

export type PhotoCountryLookup = {
  /** Capture-time GPS ISO2 when known (live uploads). */
  captureCountryCode?: string | null;
  /** Photo URI — used to resolve curated stock demo country when capture is missing. */
  sampleUri?: string | null;
};

/** Resolve ISO2 for display: GPS capture first, then curated stock metadata. */
export function resolveCaptureCountryCode(
  capture?: string | null,
  sampleUri?: string | null,
): string | undefined {
  const direct = displayCountryCode(capture);
  if (direct) return direct;
  const sample = lookupSamplePhotoByUri(sampleUri);
  if (!sample) return undefined;
  return displayCountryCode(sample.captureCountryCode ?? sample.countryCode);
}

/** Flag + label for a photo — capture GPS, or stock demo country, else Somewhere. */
export function photoCountryDisplay(
  capture?: string | null,
  lookup?: PhotoCountryLookup | null,
): PhotoCountryDisplay {
  const uri = lookup?.sampleUri;
  const code =
    resolveCaptureCountryCode(capture ?? lookup?.captureCountryCode, uri) ??
    undefined;
  if (!code) {
    return { name: "Somewhere", flag: "🌍" };
  }
  return {
    code,
    name: nameFor(code) ?? "Somewhere",
    flag: flagFor(code),
  };
}

/** Re-derive persisted match country labels from capture GPS and stock URIs. */
export function matchCountryFieldsFromCapture(match: {
  myCaptureCountryCode?: string | null;
  theirCaptureCountryCode?: string | null;
  myPhoto?: string | null;
  theirPhoto?: string | null;
}): {
  myCountry: string;
  myCountryCode?: string;
  myCountryFlag: string;
  theirCountry: string;
  theirCountryCode: string;
  theirCountryFlag: string;
  myCaptureCountryCode?: string;
  theirCaptureCountryCode?: string;
} {
  const myCapture = resolveCaptureCountryCode(
    match.myCaptureCountryCode,
    match.myPhoto,
  );
  const theirCapture = resolveCaptureCountryCode(
    match.theirCaptureCountryCode,
    match.theirPhoto,
  );
  const my = photoCountryDisplay(myCapture);
  const their = photoCountryDisplay(theirCapture);
  return {
    myCountry: my.name,
    myCountryCode: my.code,
    myCountryFlag: my.flag,
    theirCountry: their.name,
    theirCountryCode: their.code ?? "",
    theirCountryFlag: their.flag,
    myCaptureCountryCode: myCapture,
    theirCaptureCountryCode: theirCapture,
  };
}
