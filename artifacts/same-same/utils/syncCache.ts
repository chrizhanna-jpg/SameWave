import AsyncStorage from "@react-native-async-storage/async-storage";

import type { EchoCard } from "@/context/AppContext";
import type { AtlasConnection, AtlasCountry } from "@/utils/api";

const CELEBRATED_KEY = "samesame_celebrated_echo_ids";
const ECHO_CACHE_KEY = "samesame_echo_cache";
const ATLAS_CACHE_KEY = "samesame_atlas_cache";

/** Only celebrate mutual waves whose timestamp is this recent. */
export const MUTUAL_FLASH_WINDOW_MS = 15 * 60 * 1000;

const MAX_CELEBRATED_IDS = 500;

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

function shouldPersistEchoUri(uri: string | undefined): boolean {
  if (!uri?.trim()) return false;
  const u = uri.trim();
  // Inline base64 can exceed AsyncStorage limits; remote URLs are safe to keep.
  if (u.startsWith("data:")) return false;
  return u.startsWith("http://") || u.startsWith("https://");
}

function stripEchoSide(side: EchoCard["mine"]): CachedPhotoSide {
  if (shouldPersistEchoUri(side.uri)) {
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

export function hydrateEchoFromCache(cached: CachedEchoCard): EchoCard {
  return {
    ...cached,
    mine: { ...cached.mine, uri: cached.mine.uri ?? "" },
    theirs: { ...cached.theirs, uri: cached.theirs.uri ?? "" },
  };
}

function stripAtlasConnection(c: AtlasConnection): AtlasConnection {
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
  if (!opts?.allowEmpty && inbox.length === 0 && mine.length === 0) {
    const prev = await loadEchoCache();
    if (prev && (prev.inbox.length > 0 || prev.mine.length > 0)) {
      return;
    }
  }
  const payload: EchoCachePayload = {
    inbox: inbox.map(stripEchoForCache),
    mine: mine.map(stripEchoForCache),
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
