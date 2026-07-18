import AsyncStorage from "@react-native-async-storage/async-storage";

import type { EchoCard, Match } from "@/context/AppContext";
import type { AtlasConnection, AtlasCountry } from "@/utils/api";
import { photoKey } from "@/utils/photoKey";
import { photoCountryDisplay } from "@/utils/photoCountry";
import { isPersistentPhotoUri } from "@/utils/localPhotoPaths";

const CELEBRATED_KEY = "samesame_celebrated_echo_ids";
const ECHO_CACHE_KEY = "samesame_echo_cache";
const ATLAS_CACHE_KEY = "samesame_atlas_cache";
const MATCHES_CACHE_KEY = "samesame_matches_cache";
const RIPPLEFIRE_LOCAL_CACHE_KEY = "samesame_ripplefire_local";

/** Only celebrate mutual waves whose timestamp is this recent. */
export const MUTUAL_FLASH_WINDOW_MS = 15 * 60 * 1000;

const MAX_CELEBRATED_IDS = 500;
const MAX_MATCHES_CACHE = 400;

type CachedPhotoSide = Omit<EchoCard["mine"], "uri"> & { uri?: string };

export type CachedEchoCard = Omit<EchoCard, "mine" | "theirs"> & {
  mine: CachedPhotoSide;
  theirs: CachedPhotoSide;
};

export interface EchoCachePayload {
  inbox: CachedEchoCard[];
  mine: CachedEchoCard[];
  fetchedAt: string;
}

export interface AtlasCachePayload {
  countries: AtlasCountry[];
  connections: AtlasConnection[];
  fetchedAt: string;
}

let celebratedIdsMem: Set<string> | null = null;
let celebratedHydratePromise: Promise<Set<string>> | null = null;

export function shouldPersistRemoteUri(uri: string | undefined): boolean {
  if (!uri?.trim()) return false;
  const u = uri.trim();
  // Inline base64 can exceed AsyncStorage limits; remote URLs are safe to keep.
  if (u.startsWith("data:")) return false;
  if (isPersistentPhotoUri(u)) return true;
  return u.startsWith("http://") || u.startsWith("https://");
}

export function stripHeavyUrisFromMatch(m: Match): Match {
  return {
    ...m,
    myPhoto: shouldPersistRemoteUri(m.myPhoto) ? m.myPhoto.trim() : "",
    theirPhoto: shouldPersistRemoteUri(m.theirPhoto) ? m.theirPhoto.trim() : "",
    theirMusicUrl: shouldPersistRemoteUri(m.theirMusicUrl) ? m.theirMusicUrl!.trim() : undefined,
    theirCustomAudioUrl: shouldPersistRemoteUri(m.theirCustomAudioUrl)
      ? m.theirCustomAudioUrl!.trim()
      : undefined,
  };
}

export type CachedMatch = ReturnType<typeof stripHeavyUrisFromMatch>;

export interface MatchesCachePayload {
  matches: CachedMatch[];
  fetchedAt: string;
}

/** Union by id; incoming wins on conflicts. Never drop local rows when server returns empty. */
export function mergeEchoCardsById(prev: EchoCard[], incoming: EchoCard[]): EchoCard[] {
  if (incoming.length === 0) return prev;
  const byId = new Map(prev.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, e);
  return [...byId.values()].sort(
    (a, b) =>
      Date.parse(b.mutualAt ?? b.createdAt ?? "") -
      Date.parse(a.mutualAt ?? a.createdAt ?? ""),
  );
}

/** Best-effort parse of echoes persisted inside `samesame_state`. */
export function parsePersistedEchoes(raw: unknown): EchoCard[] {
  if (!Array.isArray(raw)) return [];
  const out: EchoCard[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const e = item as Partial<EchoCard>;
    if (typeof e.id !== "string" || !e.id.trim()) continue;
    if (e.state !== "pending" && e.state !== "mutual") continue;
    const mine = e.mine;
    const theirs = e.theirs;
    if (!mine || typeof mine !== "object" || !theirs || typeof theirs !== "object") {
      continue;
    }
    out.push({
      id: e.id,
      state: e.state,
      theme: typeof e.theme === "string" ? e.theme : "",
      createdAt:
        typeof e.createdAt === "string" ? e.createdAt : new Date(0).toISOString(),
      mutualAt: typeof e.mutualAt === "string" ? e.mutualAt : null,
      youSentFirst:
        typeof e.youSentFirst === "boolean" ? e.youSentFirst : undefined,
      mine: refreshEchoSideCountry({
        id: typeof mine.id === "string" ? mine.id : "",
        uri: typeof mine.uri === "string" ? mine.uri : "",
        countryCode:
          typeof mine.countryCode === "string" ? mine.countryCode : null,
        captureCountryCode:
          typeof mine.captureCountryCode === "string"
            ? mine.captureCountryCode
            : null,
        country: typeof mine.country === "string" ? mine.country : "",
        countryFlag: typeof mine.countryFlag === "string" ? mine.countryFlag : "",
        theme: typeof mine.theme === "string" ? mine.theme : undefined,
      }),
      theirs: refreshEchoSideCountry({
        id: typeof theirs.id === "string" ? theirs.id : "",
        uri: typeof theirs.uri === "string" ? theirs.uri : "",
        countryCode:
          typeof theirs.countryCode === "string" ? theirs.countryCode : null,
        captureCountryCode:
          typeof theirs.captureCountryCode === "string"
            ? theirs.captureCountryCode
            : null,
        country: typeof theirs.country === "string" ? theirs.country : "",
        countryFlag:
          typeof theirs.countryFlag === "string" ? theirs.countryFlag : "",
        theme: typeof theirs.theme === "string" ? theirs.theme : undefined,
      }),
    });
  }
  return out;
}

function preferStoredMyPhoto(existing: string, incoming: string): string {
  const ex = existing?.trim() ?? "";
  const inc = incoming?.trim() ?? "";
  if (
    ex &&
    (isPersistentPhotoUri(ex) ||
      ex.startsWith("file:") ||
      ex.startsWith("content:"))
  ) {
    return ex;
  }
  return inc || ex;
}

export function mergeMatchesById(prev: Match[], incoming: Match[]): Match[] {
  if (incoming.length === 0) return prev;

  const mergeRow = (existing: Match, m: Match): Match => ({
    ...existing,
    ...m,
    // Keep the local swipe id so late voter-photo patches still match.
    id: existing.id || m.id,
    myPhoto: preferStoredMyPhoto(existing.myPhoto, m.myPhoto),
    theirPhoto: m.theirPhoto || existing.theirPhoto,
    theirPhotoId: m.theirPhotoId || existing.theirPhotoId,
    myPhotoId: existing.myPhotoId || m.myPhotoId,
    myPhotoUploadedAt: existing.myPhotoUploadedAt || m.myPhotoUploadedAt,
  });

  const merged: Match[] = prev.map((m) => ({ ...m }));

  const findIndex = (m: Match): number => {
    const tid = m.theirPhotoId?.trim();
    if (tid) {
      const byId = merged.findIndex((x) => x.theirPhotoId?.trim() === tid);
      if (byId >= 0) return byId;
    }
    const pk = photoKey(m.theirPhoto);
    if (pk) {
      const byPhoto = merged.findIndex((x) => photoKey(x.theirPhoto) === pk);
      if (byPhoto >= 0) return byPhoto;
    }
    return merged.findIndex((x) => x.id === m.id);
  };

  for (const m of incoming) {
    const idx = findIndex(m);
    if (idx >= 0) {
      merged[idx] = mergeRow(merged[idx], m);
    } else {
      merged.push({ ...m });
    }
  }

  merged.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return merged.slice(0, MAX_MATCHES_CACHE);
}

export async function loadMatchesCache(): Promise<Match[]> {
  const parsed = await readJson<MatchesCachePayload>(MATCHES_CACHE_KEY);
  if (!parsed || !Array.isArray(parsed.matches)) return [];
  return parsed.matches.map((m) => ({
    ...m,
    myPhoto: m.myPhoto ?? "",
    theirPhoto: m.theirPhoto ?? "",
  }));
}

export async function saveMatchesCache(matches: Match[]): Promise<void> {
  const ripples = matches
    .filter((m) => m.verdict !== "different")
    .map(stripHeavyUrisFromMatch)
    .slice(0, MAX_MATCHES_CACHE);
  if (ripples.length === 0) {
    const prev = await loadMatchesCache();
    if (prev.length > 0) return;
  }
  const payload: MatchesCachePayload = {
    matches: ripples,
    fetchedAt: new Date().toISOString(),
  };
  await writeJson(MATCHES_CACHE_KEY, payload);
}

function stripEchoSide(side: EchoCard["mine"]): CachedPhotoSide {
  if (shouldPersistRemoteUri(side.uri)) {
    return { ...side, uri: side.uri.trim() };
  }
  const { uri: _uri, ...rest } = side;
  return rest;
}

function stripEchoForCache(echo: EchoCard): CachedEchoCard {
  return {
    ...echo,
    mine: stripEchoSide(echo.mine),
    theirs: stripEchoSide(echo.theirs),
  };
}

function refreshEchoSideCountry<T extends CachedPhotoSide>(side: T): T {
  const disp = photoCountryDisplay(side.captureCountryCode);
  return {
    ...side,
    country: disp.name,
    countryFlag: disp.flag,
    countryCode: disp.code ?? null,
  };
}

export function hydrateEchoFromCache(cached: CachedEchoCard): EchoCard {
  return {
    ...cached,
    mine: refreshEchoSideCountry({ ...cached.mine, uri: cached.mine.uri ?? "" }),
    theirs: refreshEchoSideCountry({
      ...cached.theirs,
      uri: cached.theirs.uri ?? "",
    }),
  };
}

function stripAtlasConnection(c: AtlasConnection): AtlasConnection {
  const thumb = c.thumbnailUrl;
  const thumbnailUrl = shouldPersistRemoteUri(thumb) ? thumb!.trim() : undefined;
  if (thumbnailUrl) return { ...c, thumbnailUrl };
  const { thumbnailUrl: _thumb, ...rest } = c;
  return rest;
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best-effort persistence — network refresh remains source of truth.
  }
}

/** Hydrate the in-memory celebrated-id set once per process. */
export async function hydrateCelebratedEchoIds(): Promise<Set<string>> {
  if (celebratedIdsMem) return celebratedIdsMem;
  if (celebratedHydratePromise) return celebratedHydratePromise;
  celebratedHydratePromise = (async () => {
    const raw = await readJson<unknown>(CELEBRATED_KEY);
    const ids = Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === "string")
      : [];
    celebratedIdsMem = new Set(ids);
    return celebratedIdsMem;
  })();
  return celebratedHydratePromise;
}

export function getCelebratedEchoIdsSync(): Set<string> {
  return celebratedIdsMem ?? new Set();
}

export async function markEchoCelebrated(id: string): Promise<void> {
  const trimmed = id.trim();
  if (!trimmed) return;
  const set = await hydrateCelebratedEchoIds();
  if (set.has(trimmed)) return;
  set.add(trimmed);
  const arr = [...set].slice(-MAX_CELEBRATED_IDS);
  celebratedIdsMem = new Set(arr);
  await writeJson(CELEBRATED_KEY, arr);
}

export async function markEchoesCelebrated(ids: string[]): Promise<void> {
  const set = await hydrateCelebratedEchoIds();
  let changed = false;
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || set.has(trimmed)) continue;
    set.add(trimmed);
    changed = true;
  }
  if (!changed) return;
  const arr = [...set].slice(-MAX_CELEBRATED_IDS);
  celebratedIdsMem = new Set(arr);
  await writeJson(CELEBRATED_KEY, arr);
}

export function shouldCelebrateMutualEcho(
  echo: EchoCard,
  celebratedIds: Set<string>,
): boolean {
  if (celebratedIds.has(echo.id)) return false;
  if (!echo.mutualAt) return false;
  const age = Date.now() - new Date(echo.mutualAt).getTime();
  if (!Number.isFinite(age) || age > MUTUAL_FLASH_WINDOW_MS) return false;
  return true;
}

export function shouldSuppressEchoNotification(
  data: Record<string, unknown> | undefined,
  celebratedIds: Set<string>,
): boolean {
  const echoId = typeof data?.echoId === "string" ? data.echoId.trim() : "";
  if (echoId && celebratedIds.has(echoId)) return true;
  return false;
}

export async function loadEchoCache(): Promise<EchoCachePayload | null> {
  const parsed = await readJson<EchoCachePayload>(ECHO_CACHE_KEY);
  if (!parsed || !Array.isArray(parsed.inbox) || !Array.isArray(parsed.mine)) {
    return null;
  }
  return parsed;
}

export async function saveEchoCache(
  inbox: EchoCard[],
  mine: EchoCard[],
  opts?: { allowEmpty?: boolean },
): Promise<void> {
  const prev = await loadEchoCache();
  let nextInbox = inbox;
  let nextMine = mine;

  if (!opts?.allowEmpty) {
    if (inbox.length === 0 && prev && prev.inbox.length > 0) {
      nextInbox = prev.inbox.map(hydrateEchoFromCache);
    }
    if (mine.length === 0 && prev && prev.mine.length > 0) {
      nextMine = prev.mine.map(hydrateEchoFromCache);
    }
    if (
      nextInbox.length === 0 &&
      nextMine.length === 0 &&
      prev &&
      (prev.inbox.length > 0 || prev.mine.length > 0)
    ) {
      return;
    }
  }

  const payload: EchoCachePayload = {
    inbox: nextInbox.map(stripEchoForCache),
    mine: nextMine.map(stripEchoForCache),
    fetchedAt: new Date().toISOString(),
  };
  await writeJson(ECHO_CACHE_KEY, payload);
}

export async function loadAtlasCache(): Promise<AtlasCachePayload | null> {
  const parsed = await readJson<AtlasCachePayload>(ATLAS_CACHE_KEY);
  if (
    !parsed ||
    !Array.isArray(parsed.countries) ||
    !Array.isArray(parsed.connections)
  ) {
    return null;
  }
  return parsed;
}

export async function saveAtlasCache(
  countries: AtlasCountry[],
  connections: AtlasConnection[],
): Promise<void> {
  if (countries.length === 0 && connections.length === 0) {
    return;
  }
  const payload: AtlasCachePayload = {
    countries,
    connections: connections.map(stripAtlasConnection),
    fetchedAt: new Date().toISOString(),
  };
  await writeJson(ATLAS_CACHE_KEY, payload);
}

export interface RipplefireLocalCachePayload {
  connections: AtlasConnection[];
  fetchedAt: string;
}

/** Device ripple arcs for Ripplefire — survives API empty responses and app updates. */
export async function loadRipplefireLocalCache(): Promise<AtlasConnection[]> {
  const parsed = await readJson<RipplefireLocalCachePayload>(RIPPLEFIRE_LOCAL_CACHE_KEY);
  if (!parsed || !Array.isArray(parsed.connections)) return [];
  return parsed.connections;
}

export async function saveRipplefireLocalCache(
  connections: AtlasConnection[],
): Promise<void> {
  const ripples = connections
    .filter((c) => c.kind === "ripple")
    .map(stripAtlasConnection);
  if (ripples.length === 0) {
    const prev = await loadRipplefireLocalCache();
    if (prev.length > 0) return;
  }
  const payload: RipplefireLocalCachePayload = {
    connections: ripples,
    fetchedAt: new Date().toISOString(),
  };
  await writeJson(RIPPLEFIRE_LOCAL_CACHE_KEY, payload);
}
