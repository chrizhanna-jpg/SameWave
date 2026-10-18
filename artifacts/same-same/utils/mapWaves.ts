/**
 * Map lines are waves only. Ripples stay off the map.
 * When real waves are scarce (launch), fill the gap with preview pairs
 * built from the curated photo catalogue. Preview ids start with
 * `launch-wave-` so they never navigate like a real echo.
 */

export const LAUNCH_WAVE_TARGET = 8;

/** The viewer's own waves. */
export const MAP_MINE_WAVE_COLOR = "#FFD166";

/** Everyone else's waves, including launch previews. */
export const MAP_OTHER_WAVE_COLOR = "#7EB6D9";

export const LAUNCH_WAVE_ID_PREFIX = "launch-wave-";

export function isLaunchWaveId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(LAUNCH_WAVE_ID_PREFIX);
}

export type LaunchPhoto = {
  id: string;
  uri: string;
  country: string;
  countryCode: string;
  countryFlag: string;
  theme: string;
};

export type MapWaveInput = {
  id: string;
  kind: "ripple" | "wave";
  from: string;
  to: string;
  createdAt: string;
  theme?: string;
  tags?: string[];
  subjects?: string[];
  color?: string;
  mine?: boolean;
  fresh?: boolean;
};

export type ViewerWaveEndpoint = {
  id: string;
  from: string;
  to: string;
  createdAt: string;
  theme?: string;
};

export type MapWaveConnection = {
  id: string;
  kind: "wave";
  from: string;
  to: string;
  createdAt: string;
  theme: string;
  tags: string[];
  subjects: string[];
  color: string;
  mine?: boolean;
  fresh?: boolean;
};

export type MapWaveFeedSide = {
  id: string;
  uri: string;
  countryCode: string | null;
  captureCountryCode: string | null;
  capturedAt: string | null;
  createdAt: string | null;
  country: string;
  countryFlag: string;
  customAudioUrl: string | null;
};

export type MapWaveFeedItem = {
  echoId: string;
  theme: string;
  mutualAt: string | null;
  a: MapWaveFeedSide;
  b: MapWaveFeedSide;
};

const LAUNCH_EPOCH_MS = 1_700_000_000_000;

function iso(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

export function countryPairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

type NormalizedPhoto = LaunchPhoto & { countryCode: string };

function usablePhotos(photos: LaunchPhoto[]): NormalizedPhoto[] {
  const out: NormalizedPhoto[] = [];
  for (const photo of photos) {
    const code = iso(photo.countryCode);
    if (!code || !photo.uri || !photo.id) continue;
    out.push({ ...photo, countryCode: code });
  }
  return out;
}

export type LaunchPhotoPair = {
  a: NormalizedPhoto;
  b: NormalizedPhoto;
  theme: string;
};

/** Stable pairs: same theme first, then any two countries not already taken. */
export function pickLaunchPhotoPairs(
  photos: LaunchPhoto[],
  taken: Set<string>,
  count: number,
): LaunchPhotoPair[] {
  if (count <= 0) return [];
  const usable = usablePhotos(photos);
  const used = new Set(taken);
  const out: LaunchPhotoPair[] = [];

  const consider = (a: NormalizedPhoto, b: NormalizedPhoto, theme: string) => {
    if (out.length >= count) return;
    if (a.countryCode === b.countryCode) return;
    const key = countryPairKey(a.countryCode, b.countryCode);
    if (used.has(key)) return;
    used.add(key);
    out.push({ a, b, theme });
  };

  const byTheme = new Map<string, NormalizedPhoto[]>();
  for (const photo of usable) {
    const theme = photo.theme.trim() || "moment";
    const list = byTheme.get(theme) ?? [];
    list.push(photo);
    byTheme.set(theme, list);
  }
  for (const [theme, group] of byTheme) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        consider(group[i]!, group[j]!, theme);
      }
    }
  }
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const theme = usable[i]!.theme.trim() || usable[j]!.theme.trim() || "moment";
      consider(usable[i]!, usable[j]!, theme);
    }
  }
  return out;
}

function connectionFromPair(pair: LaunchPhotoPair, index: number): MapWaveConnection {
  return {
    id: `${LAUNCH_WAVE_ID_PREFIX}${pair.a.countryCode}-${pair.b.countryCode}-${index}`,
    kind: "wave",
    from: pair.a.countryCode,
    to: pair.b.countryCode,
    createdAt: new Date(LAUNCH_EPOCH_MS - index * 3_600_000).toISOString(),
    theme: pair.theme,
    tags: [],
    subjects: [],
    color: MAP_OTHER_WAVE_COLOR,
    mine: false,
  };
}

function sideFromPhoto(photo: NormalizedPhoto, index: number): MapWaveFeedSide {
  return {
    id: `${LAUNCH_WAVE_ID_PREFIX}photo-${photo.id}`,
    uri: photo.uri,
    countryCode: photo.countryCode,
    captureCountryCode: photo.countryCode,
    capturedAt: null,
    createdAt: new Date(LAUNCH_EPOCH_MS - index * 3_600_000).toISOString(),
    country: photo.country,
    countryFlag: photo.countryFlag,
    customAudioUrl: null,
  };
}

/**
 * Waves only, one straight-line pair per country pair.
 * The viewer's waves are gold; every other wave is blue.
 * Preview waves are added only until `target` lines exist.
 */
export function prepareMapWaves(
  server: MapWaveInput[],
  viewer: ViewerWaveEndpoint[],
  photos: LaunchPhoto[],
  target = LAUNCH_WAVE_TARGET,
): MapWaveConnection[] {
  const byPair = new Map<string, MapWaveConnection>();

  for (const raw of server) {
    if (raw.kind !== "wave") continue;
    const from = iso(raw.from);
    const to = iso(raw.to);
    if (!from || !to || from === to) continue;
    const key = countryPairKey(from, to);
    const prev = byPair.get(key);
    const mine = raw.mine === true || prev?.mine === true;
    if (prev?.mine && raw.mine !== true) continue;
    byPair.set(key, {
      id: raw.mine === true || !prev ? raw.id : prev.id,
      kind: "wave",
      from,
      to,
      createdAt: raw.createdAt || prev?.createdAt || new Date(LAUNCH_EPOCH_MS).toISOString(),
      theme: raw.theme ?? prev?.theme ?? "",
      tags: raw.tags ?? prev?.tags ?? [],
      subjects: raw.subjects ?? prev?.subjects ?? [],
      color: mine ? MAP_MINE_WAVE_COLOR : MAP_OTHER_WAVE_COLOR,
      mine: mine || undefined,
      fresh: raw.fresh === true || prev?.fresh === true,
    });
  }

  for (const wave of viewer) {
    const from = iso(wave.from);
    const to = iso(wave.to);
    if (!from || !to || from === to) continue;
    const key = countryPairKey(from, to);
    const prev = byPair.get(key);
    byPair.set(key, {
      id: prev?.id ?? `mine-wave-${wave.id}`,
      kind: "wave",
      from,
      to,
      createdAt: wave.createdAt || prev?.createdAt || new Date(LAUNCH_EPOCH_MS).toISOString(),
      theme: wave.theme ?? prev?.theme ?? "",
      tags: prev?.tags ?? [],
      subjects: prev?.subjects ?? [],
      color: MAP_MINE_WAVE_COLOR,
      mine: true,
      fresh: prev?.fresh,
    });
  }

  const list = [...byPair.values()];
  if (list.length >= target) return list;
  const taken = new Set(list.map((c) => countryPairKey(c.from, c.to)));
  const extra = pickLaunchPhotoPairs(photos, taken, target - list.length).map(
    (pair, index) => connectionFromPair(pair, index),
  );
  return [...list, ...extra];
}

/** Keep real feed rows, and append preview pairs until the feed is full enough. */
export function fillWorldWaveFeed(
  real: MapWaveFeedItem[],
  photos: LaunchPhoto[],
  target = LAUNCH_WAVE_TARGET,
): MapWaveFeedItem[] {
  if (real.length >= target) return real;
  const taken = new Set<string>();
  for (const wave of real) {
    const a = iso(wave.a.countryCode);
    const b = iso(wave.b.countryCode);
    if (!a || !b || a === b) continue;
    taken.add(countryPairKey(a, b));
  }
  const pairs = pickLaunchPhotoPairs(photos, taken, target - real.length);
  const generated: MapWaveFeedItem[] = pairs.map((pair, index) => ({
    echoId: `${LAUNCH_WAVE_ID_PREFIX}feed-${pair.a.countryCode}-${pair.b.countryCode}-${index}`,
    theme: pair.theme,
    mutualAt: new Date(LAUNCH_EPOCH_MS - index * 3_600_000).toISOString(),
    a: sideFromPhoto(pair.a, index),
    b: sideFromPhoto(pair.b, index),
  }));
  return [...real, ...generated];
}
