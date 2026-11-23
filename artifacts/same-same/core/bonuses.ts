/**
 * Match bonuses: what two photos share beyond the picture itself.
 * A pure function, separate from the UI, so every level can be tested.
 *
 * Time is the gap between when the two photos were taken.
 * Place is whether they were taken in the same country or continent.
 */
import { continentFor, normalizeCountryCode } from "../data/countries";

export type TimeBonus = "hour" | "day" | "week" | "month";
export type PlaceBonus = "country" | "continent";

export interface Moment {
  takenAt: string | null;
  countryCode: string | null;
}

export interface MatchBonuses {
  /** Every time bonus that applies, strongest first. */
  time: TimeBonus[];
  /** Every place bonus that applies, strongest first. */
  place: PlaceBonus[];
  strongestTime: TimeBonus | null;
  strongestPlace: PlaceBonus | null;
  /** One quiet line, e.g. "Same day, same continent". Null when nothing applies. */
  headline: string | null;
  /** 0 is the strongest bonus. Null when nothing applies. */
  rank: number | null;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const TIME_WINDOWS: readonly { bonus: TimeBonus; within: number }[] = [
  { bonus: "hour", within: HOUR },
  { bonus: "day", within: DAY },
  { bonus: "week", within: 7 * DAY },
  { bonus: "month", within: 30 * DAY },
];

/** Strongest to weakest. */
export const BONUS_RANK: readonly (TimeBonus | PlaceBonus)[] = [
  "hour",
  "day",
  "week",
  "month",
  "country",
  "continent",
];

const WORDS: Record<TimeBonus | PlaceBonus, string> = {
  hour: "same hour",
  day: "same day",
  week: "same week",
  month: "same month",
  country: "same country",
  continent: "same continent",
};

function parseTime(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function timeBonuses(a: string | null, b: string | null): TimeBonus[] {
  const ta = parseTime(a);
  const tb = parseTime(b);
  if (ta === null || tb === null) return [];
  const gap = Math.abs(ta - tb);
  return TIME_WINDOWS.filter((w) => gap <= w.within).map((w) => w.bonus);
}

export function placeBonuses(a: string | null, b: string | null): PlaceBonus[] {
  const ca = normalizeCountryCode(a);
  const cb = normalizeCountryCode(b);
  if (!ca || !cb) return [];
  if (ca === cb) return ["country", "continent"];
  const continentA = continentFor(ca);
  return continentA !== null && continentA === continentFor(cb) ? ["continent"] : [];
}

function sentence(parts: string[]): string | null {
  if (parts.length === 0) return null;
  const joined = parts.join(", ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

export function matchBonuses(a: Moment, b: Moment): MatchBonuses {
  const time = timeBonuses(a.takenAt, b.takenAt);
  const place = placeBonuses(a.countryCode, b.countryCode);
  const strongestTime = time[0] ?? null;
  const strongestPlace = place[0] ?? null;

  const parts: string[] = [];
  if (strongestTime) parts.push(WORDS[strongestTime]);
  if (strongestPlace) parts.push(WORDS[strongestPlace]);

  const strongest = strongestTime ?? strongestPlace;
  return {
    time,
    place,
    strongestTime,
    strongestPlace,
    headline: sentence(parts),
    rank: strongest ? BONUS_RANK.indexOf(strongest) : null,
  };
}

/** "Taken 3 hours apart", for the details panel. Null when a time is unknown. */
export function describeGap(a: string | null, b: string | null): string | null {
  const ta = parseTime(a);
  const tb = parseTime(b);
  if (ta === null || tb === null) return null;
  const gap = Math.abs(ta - tb);
  if (gap < 2 * 60 * 1000) return "Taken at the same moment";
  if (gap < HOUR) return `Taken ${Math.round(gap / 60000)} minutes apart`;
  if (gap < DAY) return `Taken ${plural(Math.round(gap / HOUR), "hour")} apart`;
  if (gap < 60 * DAY) return `Taken ${plural(Math.round(gap / DAY), "day")} apart`;
  return `Taken ${plural(Math.round(gap / (30 * DAY)), "month")} apart`;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}
