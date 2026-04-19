// Tiered celebrations for matches.
// Time tiers: how close in time were the two posts? Closer = bigger deal.
// Geo tiers: how close geographically? Same country (rare) > continent > planet.

export type TimeTierKind = "minute" | "hour" | "day" | "week" | "distant";

export interface TimeTier {
  kind: TimeTierKind;
  rank: number; // higher = rarer/cooler
  label: string; // short headline e.g. "SAME MINUTE"
  sub: string; // sentence describing it
  emoji: string;
  sparkles: number; // 0..3 — how much to celebrate
}

/**
 * Diff in minutes between when *I* posted and when *they* posted, using
 * absolute time so close-in-time always wins regardless of order.
 */
export function getTimeTier(
  myUploadedAt: string | undefined,
  theirMinutesAgo: number | undefined,
): TimeTier {
  if (!myUploadedAt || theirMinutesAgo == null) {
    return {
      kind: "distant",
      rank: 0,
      label: "Across time",
      sub: "Across time, you both shared the same thing.",
      emoji: "🌌",
      sparkles: 0,
    };
  }

  const myAgeMin = (Date.now() - new Date(myUploadedAt).getTime()) / 60000;
  const diffMin = Math.abs(myAgeMin - theirMinutesAgo);

  if (diffMin < 1) {
    return {
      kind: "minute",
      rank: 4,
      label: "Same Minute",
      sub: "Right now, in this minute, two strangers are sharing the same thing.",
      emoji: "⚡",
      sparkles: 3,
    };
  }
  if (diffMin < 60) {
    return {
      kind: "hour",
      rank: 3,
      label: "Same Hour",
      sub: "Within an hour of each other, on opposite sides of the world.",
      emoji: "✨",
      sparkles: 2,
    };
  }
  if (diffMin < 60 * 24) {
    return {
      kind: "day",
      rank: 2,
      label: "Same Day",
      sub: "Both posted within 24 hours. Rare and beautiful.",
      emoji: "☀️",
      sparkles: 1,
    };
  }
  if (diffMin < 60 * 24 * 7) {
    return {
      kind: "week",
      rank: 1,
      label: "Same Week",
      sub: "Both shared the same thing within the same week.",
      emoji: "🗓️",
      sparkles: 0,
    };
  }
  return {
    kind: "distant",
    rank: 0,
    label: "Across time",
    sub: "Across time, you both shared the same thing.",
    emoji: "🌌",
    sparkles: 0,
  };
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

  return {
    kind: "planet",
    rank: 1,
    label: "Same Planet",
    sub: "Across the world, on the same little planet.",
    emoji: "🌍",
  };
}
