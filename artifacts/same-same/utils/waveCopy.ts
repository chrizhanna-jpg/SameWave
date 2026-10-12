/** Pure copy and geography helpers for the Wave experience. No native imports. */

export function readableVibe(raw: string | null | undefined): string {
  const t = (raw ?? "").trim().replace(/^#/, "");
  if (!t) return "";
  const spaced = t.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** "The Quiet Morning Wave", or "The Quiet Wave" when both vibes match. */
export function waveNameFromVibes(
  vibeA: string | null | undefined,
  vibeB: string | null | undefined,
): string {
  const left = readableVibe(vibeA);
  const right = readableVibe(vibeB);
  if (!left && !right) return "The Quiet Wave";
  if (!left || !right || left.toLowerCase() === right.toLowerCase()) {
    return `The ${left || right} Wave`;
  }
  return `The ${left} ${right} Wave`;
}

export function ordinal(n: number): string {
  const abs = Math.max(0, Math.floor(n));
  const teen = abs % 100;
  if (teen >= 11 && teen <= 13) return `${abs}th`;
  switch (abs % 10) {
    case 1:
      return `${abs}st`;
    case 2:
      return `${abs}nd`;
    case 3:
      return `${abs}rd`;
    default:
      return `${abs}th`;
  }
}

/** Great-circle miles between two [longitude, latitude] points. */
export function haversineMiles(
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function prefersMiles(locale: string | null | undefined): boolean {
  const tag = (locale ?? "").toLowerCase();
  return tag === "en-us" || tag === "en-gb" || tag.startsWith("en-us") || tag.startsWith("en-gb");
}

export function formatSeparation(
  miles: number,
  useMiles: boolean,
): string {
  const rounded = Math.max(0, Math.round(useMiles ? miles : miles * 1.60934));
  const unit = useMiles ? "miles" : "kilometres";
  return `${rounded.toLocaleString("en-US")} ${unit}`;
}

export function weatherWord(code: number | null | undefined): string | null {
  if (code == null || !Number.isFinite(code)) return null;
  if (code === 0) return "Clear";
  if (code <= 3) return "Cloudy";
  if (code === 45 || code === 48) return "Foggy";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "Rainy";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "Snowy";
  if (code >= 95) return "Stormy";
  return null;
}

const ZONE_GROUPS: Record<string, string[]> = {
  "Europe/London": ["GB", "IE", "PT", "IS"],
  "Europe/Paris": ["FR", "BE", "NL", "LU", "ES", "MC"],
  "Europe/Berlin": ["DE", "AT", "CH", "IT", "SE", "NO", "DK", "PL", "CZ", "SK", "HU", "SI", "HR", "BA", "RS", "ME", "MK", "AL", "XK", "MT"],
  "Europe/Helsinki": ["FI", "EE", "LV", "LT", "UA", "RO", "BG", "GR", "CY"],
  "Europe/Moscow": ["RU", "BY"],
  "Europe/Istanbul": ["TR"],
  "Asia/Tokyo": ["JP"],
  "Asia/Seoul": ["KR"],
  "Asia/Shanghai": ["CN", "HK", "TW", "MO"],
  "Asia/Kolkata": ["IN", "LK"],
  "Asia/Bangkok": ["TH", "VN", "KH", "LA"],
  "Asia/Jakarta": ["ID"],
  "Asia/Manila": ["PH"],
  "Asia/Singapore": ["SG", "MY", "BN"],
  "Asia/Dhaka": ["BD"],
  "Asia/Karachi": ["PK"],
  "Asia/Dubai": ["AE", "OM"],
  "Asia/Riyadh": ["SA", "QA", "KW", "BH", "YE", "IQ"],
  "Asia/Jerusalem": ["IL", "PS"],
  "Africa/Cairo": ["EG"],
  "Africa/Johannesburg": ["ZA", "LS", "SZ", "BW", "NA", "ZW", "MZ", "ZM", "MW"],
  "Africa/Lagos": ["NG", "GH", "CI", "SN", "BJ", "TG", "NE"],
  "Africa/Nairobi": ["KE", "TZ", "UG", "ET", "RW", "BI"],
  "Africa/Casablanca": ["MA", "EH"],
  "America/New_York": ["US"],
  "America/Toronto": ["CA"],
  "America/Mexico_City": ["MX"],
  "America/Sao_Paulo": ["BR"],
  "America/Argentina/Buenos_Aires": ["AR"],
  "America/Santiago": ["CL"],
  "America/Bogota": ["CO", "PE", "EC"],
  "Australia/Sydney": ["AU"],
  "Pacific/Auckland": ["NZ"],
};

const COUNTRY_TIMEZONE: Record<string, string> = {};
for (const [zone, codes] of Object.entries(ZONE_GROUPS)) {
  for (const code of codes) COUNTRY_TIMEZONE[code] = zone;
}

export function timezoneForCountry(code: string | null | undefined): string | null {
  if (!code) return null;
  return COUNTRY_TIMEZONE[code.trim().toUpperCase()] ?? null;
}

/** "Taken at 7:14am" in that country's primary civil time. */
export function formatTakenAt(
  iso: string | null | undefined,
  countryCode: string | null | undefined,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const timeZone = timezoneForCountry(countryCode);
  if (!timeZone) return null;
  const formatted = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  })
    .format(date)
    .toLowerCase()
    .replace(/\s/g, "");
  return `Taken at ${formatted}`;
}

/** World tab headline counters. Singular at exactly one. */
export function yearCountLabels(ripples: number, waves: number): string[] {
  const fmt = (n: number) => Math.max(0, Math.round(n)).toLocaleString("en-US");
  const r = Math.max(0, Math.round(ripples));
  const w = Math.max(0, Math.round(waves));
  return [
    `${fmt(r)} ${r === 1 ? "Ripple" : "Ripples"} this year`,
    `${fmt(w)} ${w === 1 ? "Wave" : "Waves"} this year`,
  ];
}

/** True when an ISO timestamp falls in the current UTC year. */
export function isInUtcYear(iso: string | null | undefined, now: Date = new Date()): boolean {
  if (!iso) return false;
  const at = new Date(iso);
  return !Number.isNaN(at.getTime()) && at.getUTCFullYear() === now.getUTCFullYear();
}
