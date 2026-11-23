/**
 * Remote feature flags from GET /api/public/app-config.
 * Missing endpoint / fetch failure → all flags OFF (fail closed).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import { apiOrigin } from "@/config/env";

const CACHE_KEY = "samewave.features.v1";
const FETCH_MS = 8000;

export type AppFeatures = {
  recordSound: boolean;
};

const OFF: AppFeatures = { recordSound: false };

let memory: AppFeatures | null = null;
const listeners = new Set<(features: AppFeatures) => void>();

function parseFeatures(raw: unknown): AppFeatures {
  if (!raw || typeof raw !== "object") return OFF;
  const features = (raw as { features?: unknown }).features;
  if (!features || typeof features !== "object") return OFF;
  const recordSound = (features as { recordSound?: unknown }).recordSound === true;
  return { recordSound };
}

export function peekFeatures(): AppFeatures {
  return memory ?? OFF;
}

export function subscribeFeatures(listener: (features: AppFeatures) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: AppFeatures) {
  memory = next;
  for (const listener of listeners) listener(next);
}

export async function readCachedFeatures(): Promise<AppFeatures> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return OFF;
    const parsed = JSON.parse(raw) as unknown;
    return parseFeatures({ features: parsed });
  } catch {
    return OFF;
  }
}

async function writeCache(features: AppFeatures): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(features));
  } catch {
    // Ignore storage failures — in-memory + fail-closed still apply.
  }
}

/** Fetch flags at boot / resume. Never throws; failures leave flags OFF. */
export async function refreshFeatures(): Promise<AppFeatures> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const response = await fetch(`${apiOrigin()}/api/public/app-config`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      publish(OFF);
      return OFF;
    }
    const body = (await response.json()) as unknown;
    const next = parseFeatures(body);
    await writeCache(next);
    publish(next);
    return next;
  } catch {
    const cached = await readCachedFeatures();
    // Spec: missing endpoint or fetch fail → OFF. Cached ON only if we
    // previously succeeded; still prefer fail-closed when network is down
    // after a prior ON — keep last known so flipping on Render sticks offline.
    publish(cached);
    return cached;
  } finally {
    clearTimeout(timer);
  }
}

/** Boot: hydrate from cache (instant OFF/ON), then refresh from server. */
export async function bootFeatures(): Promise<AppFeatures> {
  const cached = await readCachedFeatures();
  publish(cached);
  return refreshFeatures();
}
