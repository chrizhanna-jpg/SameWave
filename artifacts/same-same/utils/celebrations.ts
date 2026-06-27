// Tiered celebrations for matches.
// Time tiers: how close in time were the two posts? Closer = bigger deal.
// Geo tiers: how close geographically? Same country (rare) > continent > planet.

// "minute" is retained in the union for backwards-compatibility with older
// persisted matches and existing kind checks, but the calendar ladder below
// no longer emits it — the rarest emitted tier is "hour".
export type TimeTierKind =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "distant";

export interface TimeTier {
  kind: TimeTierKind;
  rank: number; // higher = rarer/cooler
  label: string; // short headline e.g. "SAME HOUR"
  sub: string; // sentence describing it
  emoji: string;
  sparkles: number; // 0..3 — how much to celebrate
  /**
   * True when at least one side had no real capture time and the tier was
   * computed from its upload/share time instead. Drives the soft
   * "matched by when you shared it" note + in-app-camera nudge in the UI.
   */
  usedShareFallback: boolean;
}

/**
 * One side of a temporal match. Each side resolves to a single instant:
 * the real capture time when known (EXIF DateTimeOriginal / in-app camera
 * shutter), otherwise the upload/share time. When we fall back to share
 * time we flag it so the UI can surface the soft note.
 */
export interface TimeTierInput {
  /** Real capture instant (ISO). Preferred basis for the tier. */
  capturedAt?: string | null;
  /** Upload/share instant (ISO) — fallback when capture time is unknown. */
  sharedAt?: string | null;
}

const DISTANT_TIER: Omit<TimeTier, "usedShareFallback"> = {
  kind: "distant",
  rank: 0,
  label: "Across time",
  sub: "Across time, you both shared the same thing.",
  emoji: "🌌",
  sparkles: 0,
};

const SAME_MONTH_TIER: Omit<TimeTier, "usedShareFallback"> = {
  kind: "month",
  rank: 1,
  label: "Same Month",
  sub: "Both shared the same thing in the same month.",
  emoji: "📅",
  sparkles: 0,
};

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** Parse an ISO (or EXIF "YYYY:MM:DD HH:MM:SS") string to epoch ms, or null. */
function parseInstant(value: string | null | undefined): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  let s = value.trim();
  // EXIF DateTimeOriginal uses colons in the date part ("2024:06:01 14:03:22").
  // Normalise the first two colons to dashes and insert a "T" so Date can read
  // it. (The capture extractor already converts to ISO, but be defensive.)
  const exif = /^(\d{4}):(\d{2}):(\d{2})[ T](.+)$/.exec(s);
  if (exif) s = `${exif[1]}-${exif[2]}-${exif[3]}T${exif[4]}`;
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Resolve a side to its matching instant + whether it used the share fallback. */
function resolveSide(
  input: TimeTierInput | undefined,
): { ms: number; usedShare: boolean } | null {
  if (!input) return null;
  const captured = parseInstant(input.capturedAt);
  if (captured != null) return { ms: captured, usedShare: false };
  const shared = parseInstant(input.sharedAt);
  if (shared != null) return { ms: shared, usedShare: true };
  return null;
}

/** Monday-based week index relative to the epoch (1970-01-01 was a Thursday). */
function utcWeekIndex(ms: number): number {
  return Math.floor((Math.floor(ms / MS_PER_DAY) + 3) / 7);
}

/**
 * Temporal celebration tier for a match between two photos.
 *
 * The tier is computed from TWO FIXED absolute instants — each side's real
 * capture time (EXIF / in-app camera) when known, else its upload/share time
 * — using CALENDAR buckets rather than a rolling "within N minutes" window:
 *
 *   Same Hour → Same Day → Same Week → Same Month → Across time.
 *
 * Timezone decision (kept deliberately simple and documented): both instants
 * are compared on a single, fixed UTC calendar. Same-hour ⟺ same UTC
 * year/month/day/hour, same-day ⟺ same UTC date, same-week ⟺ same Monday-based
 * UTC week, same-month ⟺ same UTC year+month. Because the comparison uses two
 * frozen timestamps and never reads `Date.now()` or the viewer's local zone,
 * the tier is STABLE: reopening a match on any screen (reveal, history,
 * journey, atlas) always yields the same result. This is what eliminates the
 * old drift bug, where a rolling diff recomputed against `Date.now()` made a
 * "Same Hour" match loosen to "Same Day" → "Across time" over time.
 *
 * Each side independently falls back from capture → share time; whenever any
 * side uses the share fallback, `usedShareFallback` is set so the UI can show
 * the soft "matched by when you shared it" note.
 */
export function getTimeTier(
  mine: TimeTierInput | undefined,
  theirs: TimeTierInput | undefined,
): TimeTier {
  const a = resolveSide(mine);
  const b = resolveSide(theirs);
  if (!a || !b) {
    // Not enough information on one side — no honest tier and nothing to
    // attribute to a share-time fallback.
    return { ...DISTANT_TIER, usedShareFallback: false };
  }

  const usedShareFallback = a.usedShare || b.usedShare;

  if (Math.floor(a.ms / MS_PER_HOUR) === Math.floor(b.ms / MS_PER_HOUR)) {
    return {
      kind: "hour",
      rank: 4,
      label: "Same Hour",
      sub: "Within the same hour, on opposite sides of the world.",
      emoji: "✨",
      sparkles: 2,
      usedShareFallback,
    };
  }
  if (Math.floor(a.ms / MS_PER_DAY) === Math.floor(b.ms / MS_PER_DAY)) {
    return {
      kind: "day",
      rank: 3,
      label: "Same Day",
      sub: "Both shared the same thing on the same day. Rare and beautiful.",
      emoji: "☀️",
      sparkles: 1,
      usedShareFallback,
    };
  }
  if (utcWeekIndex(a.ms) === utcWeekIndex(b.ms)) {
    return {
      kind: "week",
      rank: 2,
      label: "Same Week",
      sub: "Both shared the same thing in the same week.",
      emoji: "🗓️",
      sparkles: 0,
      usedShareFallback,
    };
  }
  const da = new Date(a.ms);
  const db = new Date(b.ms);
  if (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth()
  ) {
    return { ...SAME_MONTH_TIER, usedShareFallback };
  }
  return { ...DISTANT_TIER, usedShareFallback };
}

/**
 * Shape of the persisted-match fields the temporal tier needs. Kept structural
 * (not importing the `Match` type) so `celebrations` stays dependency-free.
 */
export interface MatchTimeFields {
  myPhotoCapturedAt?: string;
  myPhotoUploadedAt?: string;
  theirPhotoCapturedAt?: string;
  theirPhotoSharedAt?: string;
  /** @deprecated legacy relative snapshot — only used for old persisted matches. */
  theirPhotoMinutesAgo?: number;
  /** Match creation instant — stable anchor for the legacy `minutesAgo` fallback. */
  timestamp?: string;
}

/**
 * Resolve the temporal tier for a persisted match. New matches carry absolute
 * `*CapturedAt` / `*SharedAt` snapshots and compute a stable calendar tier.
 *
 * Legacy matches (saved before the rebuild) only have the relative
 * `theirPhotoMinutesAgo`. For those we reconstruct their share instant ONCE
 * from the match's own `timestamp` (swipe time) minus that frozen offset —
 * a fixed anchor, NOT `Date.now()` — so even legacy matches no longer drift.
 */
export function getTimeTierForMatch(m: MatchTimeFields): TimeTier {
  let theirShared = m.theirPhotoSharedAt;
  if (!theirShared && typeof m.theirPhotoMinutesAgo === "number") {
    const anchor = parseInstant(m.timestamp);
    if (anchor != null) {
      theirShared = new Date(
        anchor - m.theirPhotoMinutesAgo * 60_000,
      ).toISOString();
    }
  }
  return getTimeTier(
    { capturedAt: m.myPhotoCapturedAt, sharedAt: m.myPhotoUploadedAt },
    { capturedAt: m.theirPhotoCapturedAt, sharedAt: theirShared },
  );
}

// --- Geography ---

export type Continent =
  | "Africa"
  | "Antarctica"
  | "Asia"
  | "Europe"
  | "North America"
  | "Oceania"
  | "South America";

const CONTINENT_BY_CODE: Record<string, Continent> = {
  // Europe
  GB: "Europe", IE: "Europe", FR: "Europe", DE: "Europe", IT: "Europe", ES: "Europe",
  PT: "Europe", NL: "Europe", BE: "Europe", LU: "Europe", CH: "Europe", AT: "Europe",
  SE: "Europe", NO: "Europe", DK: "Europe", FI: "Europe", IS: "Europe", PL: "Europe",
  CZ: "Europe", SK: "Europe", HU: "Europe", RO: "Europe", BG: "Europe", GR: "Europe",
  HR: "Europe", SI: "Europe", BA: "Europe", RS: "Europe", ME: "Europe", MK: "Europe",
  AL: "Europe", XK: "Europe", LT: "Europe", LV: "Europe", EE: "Europe", BY: "Europe",
  UA: "Europe", MD: "Europe", RU: "Europe", MT: "Europe", CY: "Europe",

  // Asia
  CN: "Asia", JP: "Asia", KR: "Asia", KP: "Asia", IN: "Asia", TH: "Asia", VN: "Asia",
  ID: "Asia", PH: "Asia", MY: "Asia", SG: "Asia", BD: "Asia", PK: "Asia", NP: "Asia",
  LK: "Asia", MM: "Asia", KH: "Asia", LA: "Asia", MN: "Asia", TW: "Asia", HK: "Asia",
  BT: "Asia", MV: "Asia", TL: "Asia", BN: "Asia", AF: "Asia", IR: "Asia", IQ: "Asia",
  SY: "Asia", SA: "Asia", AE: "Asia", QA: "Asia", KW: "Asia", BH: "Asia", OM: "Asia",
  YE: "Asia", JO: "Asia", LB: "Asia", IL: "Asia", PS: "Asia", TR: "Asia", AZ: "Asia",
  GE: "Asia", AM: "Asia", KZ: "Asia", UZ: "Asia", TM: "Asia", TJ: "Asia", KG: "Asia",

  // Africa
  NG: "Africa", ZA: "Africa", KE: "Africa", ET: "Africa", GH: "Africa", TZ: "Africa",
  UG: "Africa", DZ: "Africa", SD: "Africa", EG: "Africa", MA: "Africa", TN: "Africa",
  LY: "Africa", CM: "Africa", CI: "Africa", SN: "Africa", ML: "Africa", BF: "Africa",
  NE: "Africa", MW: "Africa", ZM: "Africa", ZW: "Africa", MZ: "Africa", AO: "Africa",
  RW: "Africa", SO: "Africa", MG: "Africa", CD: "Africa", CG: "Africa", GA: "Africa",
  GN: "Africa", SL: "Africa", LR: "Africa", GW: "Africa", GM: "Africa", CV: "Africa",
  ST: "Africa", EH: "Africa", MR: "Africa", TG: "Africa", BJ: "Africa", GQ: "Africa",
  CF: "Africa", TD: "Africa", SS: "Africa", BI: "Africa", DJ: "Africa", KM: "Africa",
  ER: "Africa", SC: "Africa", MU: "Africa", NA: "Africa", BW: "Africa", LS: "Africa",
  SZ: "Africa",

  // North America
  US: "North America", CA: "North America", MX: "North America", GT: "North America",
  BZ: "North America", SV: "North America", HN: "North America", NI: "North America",
  CR: "North America", PA: "North America", CU: "North America", DO: "North America",
  HT: "North America", JM: "North America", BS: "North America", BB: "North America",
  TT: "North America", LC: "North America", VC: "North America", GD: "North America",
  AG: "North America", DM: "North America", KN: "North America",

  // South America
  BR: "South America", AR: "South America", CL: "South America", CO: "South America",
  PE: "South America", VE: "South America", EC: "South America", BO: "South America",
  PY: "South America", UY: "South America", GY: "South America", SR: "South America",

  // Oceania
  AU: "Oceania", NZ: "Oceania", FJ: "Oceania", PG: "Oceania", SB: "Oceania",
  VU: "Oceania", WS: "Oceania", TO: "Oceania", KI: "Oceania", FM: "Oceania",
  PW: "Oceania", MH: "Oceania", NR: "Oceania", TV: "Oceania",

  // Dependencies, micro-states & territories. These never appear as a
  // selectable home country (they're absent from data/countries.ts), but
  // GPS reverse-geocoding (expo-location) can return any of them as the
  // capture-time ISO2 for a real photo. Mapping them here keeps the
  // continent tier honest for a user who shoots in e.g. Monaco, Puerto
  // Rico or Greenland instead of silently collapsing to "Same Planet".
  // Europe
  AD: "Europe", MC: "Europe", SM: "Europe", VA: "Europe", LI: "Europe",
  GI: "Europe", JE: "Europe", GG: "Europe", IM: "Europe", FO: "Europe",
  AX: "Europe", SJ: "Europe",
  // Asia
  MO: "Asia",
  // Africa
  RE: "Africa", YT: "Africa", SH: "Africa", IO: "Africa",
  // North America (incl. Caribbean dependencies)
  GL: "North America", PR: "North America", VI: "North America",
  VG: "North America", KY: "North America", BM: "North America",
  AW: "North America", CW: "North America", SX: "North America",
  BQ: "North America", TC: "North America", AI: "North America",
  MS: "North America", GP: "North America", MQ: "North America",
  BL: "North America", MF: "North America", PM: "North America",
  // South America
  GF: "South America", FK: "South America",
  // Oceania
  GU: "Oceania", MP: "Oceania", AS: "Oceania", PF: "Oceania",
  NC: "Oceania", CK: "Oceania", NU: "Oceania", WF: "Oceania",
  NF: "Oceania", TK: "Oceania", PN: "Oceania",
  // Antarctica & sub-antarctic territories
  AQ: "Antarctica", GS: "Antarctica", TF: "Antarctica", BV: "Antarctica",
  HM: "Antarctica",
};

export function getContinent(code?: string): Continent | undefined {
  if (!code) return undefined;
  return CONTINENT_BY_CODE[code.toUpperCase()];
}

export type GeoTierKind = "country" | "continent" | "planet";

export interface GeoTier {
  kind: GeoTierKind;
  rank: number;
  label: string; // short headline e.g. "SAME COUNTRY"
  sub: string;
  emoji: string;
}

const SAME_PLANET_TIER: GeoTier = {
  kind: "planet",
  rank: 1,
  label: "Same Planet",
  sub: "Across the world, on the same planet.",
  emoji: "🌍",
};

/**
 * Geo celebration for a match between two photos. Each side passes its
 * best-known ISO2 in `captureCountryCode`, resolved upstream by this
 * priority so the tier degrades sensibly rather than collapsing to
 * "Same Planet" whenever GPS is missing:
 *
 *   1. real capture-time GPS country (device fix / embedded EXIF), else
 *   2. the photo's known/assigned country — the curated demo country for
 *      stock/sample photos, or the uploader's declared home country for
 *      live photos shot with GPS off, else
 *   3. truly unknown → caps at Same Planet.
 *
 * Steps 1–2 are applied at the data layer (camera upload, sample photo
 * enrichment, and the candidate/echo API decoders) so both arguments here
 * already carry the resolved code. We only need a valid 2-letter code on
 * each side to reach the Same Country / Same Continent tiers.
 */
export function getGeoTierForPhotos(
  myCapture?: string | null,
  theirCapture?: string | null,
): GeoTier {
  const a = myCapture?.trim().toUpperCase();
  const b = theirCapture?.trim().toUpperCase();
  if (!a || !b || a.length !== 2 || b.length !== 2) {
    return SAME_PLANET_TIER;
  }
  return getGeoTier(a, b);
}

export function getGeoTier(myCode?: string, theirCode?: string): GeoTier {
  const a = myCode?.toUpperCase();
  const b = theirCode?.toUpperCase();

  if (a && b && a === b) {
    return {
      kind: "country",
      rank: 3,
      label: "Same Country",
      sub: "Both in the same country — a same-same neighbour.",
      emoji: "📍",
    };
  }

  const ca = getContinent(a);
  const cb = getContinent(b);
  if (ca && cb && ca === cb) {
    return {
      kind: "continent",
      rank: 2,
      label: `Same Continent · ${ca}`,
      sub: `Both somewhere in ${ca}.`,
      emoji: "🌎",
    };
  }

  return SAME_PLANET_TIER;
}
