// Server-driven "submitted themes & vibes" catalog.
//
// The owner approves submitted theme / vibe words on a hidden admin screen
// (see app/admin-catalog.tsx). Approvals are served by the API at
// GET /api/catalog and merged on top of the hardcoded presets here so a
// previously icon-less word resolves to its approved emoji + music app-wide
// WITHOUT a rebuild.
//
// This module is a low-level cache only — it deliberately imports nothing
// heavy (no api.ts, no musicLibrary) so it can be safely consumed by
// resolveThemeDisplay.ts and musicLibrary.ts without import cycles. It:
//   • hydrates from AsyncStorage on first use (instant, offline-friendly),
//   • refreshes from the network in the background with a TTL,
//   • degrades gracefully to the persisted snapshot / presets when offline.

import AsyncStorage from "@react-native-async-storage/async-storage";

import { getPublicApiOrigin } from "@/utils/publicEnv";

export type CatalogKind = "theme" | "vibe";

export interface ServerCatalogEntry {
  /** Normalized canonical key (matches normalizeCatalogWord). */
  word: string;
  kind: CatalogKind;
  /** Human-readable label (defaults server-side to the word). */
  title: string;
  /** Owner-assigned icon. */
  emoji: string;
  /** A vibe id from musicLibrary OR a direct https track URL. */
  musicRef: string;
}

interface CatalogSnapshot {
  themes: ServerCatalogEntry[];
  vibes: ServerCatalogEntry[];
}

const STORAGE_KEY = "samesame_server_catalog_v1";
const TTL_MS = 60 * 60 * 1000; // 1h — approvals are rare; cheap to be lazy.
const FETCH_TIMEOUT_MS = 12_000;

// In-memory lookup maps keyed by normalized word, per kind.
let themeMap = new Map<string, ServerCatalogEntry>();
let vibeMap = new Map<string, ServerCatalogEntry>();
let fetchedAt = 0;
let hydratedFromStorage = false;
let inflight: Promise<void> | null = null;

// Bumped whenever the in-memory catalog changes so UI surfaces can re-render.
let version = 0;
const listeners = new Set<() => void>();

function notify(): void {
  version += 1;
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* listener errors must never break a catalog refresh */
    }
  });
}

/** Subscribe to catalog changes. Returns an unsubscribe fn. */
export function onServerCatalogChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Monotonic version for `useSyncExternalStore`-style subscriptions. */
export function getServerCatalogVersion(): number {
  return version;
}

/**
 * Normalize a raw theme/vibe word to its catalog lookup key. MUST mirror the
 * server's normalizeWord (lib/challengeTheme.ts stripThemePrefixes): trim,
 * lowercase, then strip a leading "your/a/an/the ".
 */
export function normalizeCatalogWord(raw: string): string {
  let t = (raw ?? "").trim().toLowerCase();
  for (const prefix of ["your ", "a ", "an ", "the "]) {
    if (t.startsWith(prefix)) {
      t = t.slice(prefix.length).trim();
      break;
    }
  }
  return t;
}

function applySnapshot(snap: CatalogSnapshot): void {
  const nextTheme = new Map<string, ServerCatalogEntry>();
  const nextVibe = new Map<string, ServerCatalogEntry>();
  for (const e of snap.themes ?? []) {
    if (e && typeof e.word === "string" && e.word) nextTheme.set(e.word, e);
  }
  for (const e of snap.vibes ?? []) {
    if (e && typeof e.word === "string" && e.word) nextVibe.set(e.word, e);
  }
  themeMap = nextTheme;
  vibeMap = nextVibe;
  notify();
}

function sanitizeEntry(raw: unknown, kind: CatalogKind): ServerCatalogEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const word = typeof r.word === "string" ? r.word : "";
  const emoji = typeof r.emoji === "string" ? r.emoji : "";
  const musicRef = typeof r.musicRef === "string" ? r.musicRef : "";
  if (!word || !emoji) return null;
  const title =
    typeof r.title === "string" && r.title.trim().length > 0
      ? r.title
      : word;
  return { word, kind, title, emoji, musicRef };
}

async function hydrateFromStorage(): Promise<void> {
  if (hydratedFromStorage) return;
  hydratedFromStorage = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      fetchedAt?: number;
      themes?: unknown[];
      vibes?: unknown[];
    };
    const themes = (parsed.themes ?? [])
      .map((e) => sanitizeEntry(e, "theme"))
      .filter((e): e is ServerCatalogEntry => e != null);
    const vibes = (parsed.vibes ?? [])
      .map((e) => sanitizeEntry(e, "vibe"))
      .filter((e): e is ServerCatalogEntry => e != null);
    fetchedAt = typeof parsed.fetchedAt === "number" ? parsed.fetchedAt : 0;
    applySnapshot({ themes, vibes });
  } catch {
    /* corrupt cache — ignore, presets remain the base */
  }
}

async function persist(snap: CatalogSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), ...snap }),
    );
  } catch {
    /* best-effort */
  }
}

async function fetchOnce(): Promise<void> {
  const base = getPublicApiOrigin().replace(/\/$/, "");
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/catalog`, {
      signal: controller.signal,
    });
    if (!res.ok) return;
    const json = (await res.json()) as { themes?: unknown[]; vibes?: unknown[] };
    const themes = (json.themes ?? [])
      .map((e) => sanitizeEntry(e, "theme"))
      .filter((e): e is ServerCatalogEntry => e != null);
    const vibes = (json.vibes ?? [])
      .map((e) => sanitizeEntry(e, "vibe"))
      .filter((e): e is ServerCatalogEntry => e != null);
    fetchedAt = Date.now();
    applySnapshot({ themes, vibes });
    await persist({ themes, vibes });
  } catch {
    // Network/offline — keep whatever we have (persisted snapshot / presets).
  } finally {
    clearTimeout(tid);
  }
}

/**
 * Force a network refresh now (e.g. after an admin approve/delete so the
 * change goes live in the running app immediately). Coalesces concurrent
 * callers.
 */
export async function refreshServerCatalog(): Promise<void> {
  await hydrateFromStorage();
  if (inflight) return inflight;
  inflight = fetchOnce().finally(() => {
    inflight = null;
  });
  return inflight;
}

/**
 * Best-effort lazy refresh used by the synchronous lookups: hydrates from
 * storage on first call and kicks a background network refresh when the
 * cache is stale. Never blocks the caller.
 */
function ensureFreshLazy(): void {
  if (!hydratedFromStorage) {
    void hydrateFromStorage().then(() => {
      if (Date.now() - fetchedAt > TTL_MS) void refreshServerCatalog();
    });
    return;
  }
  if (Date.now() - fetchedAt > TTL_MS && !inflight) {
    void refreshServerCatalog();
  }
}

/** Approved theme entry for a raw word, or null. */
export function getApprovedThemeEntry(raw: string): ServerCatalogEntry | null {
  ensureFreshLazy();
  return themeMap.get(normalizeCatalogWord(raw)) ?? null;
}

/** Approved vibe entry for a raw word, or null. */
export function getApprovedVibeEntry(raw: string): ServerCatalogEntry | null {
  ensureFreshLazy();
  return vibeMap.get(normalizeCatalogWord(raw)) ?? null;
}

/** Approved emoji for a submitted theme word (server-driven icon), or null. */
export function getCatalogThemeEmoji(raw: string): string | null {
  return getApprovedThemeEntry(raw)?.emoji ?? null;
}

/**
 * The musicRef the owner attached to an approved theme/vibe word — a vibe id
 * (musicLibrary) or a direct https URL. Returns null when not approved.
 */
export function getCatalogMusicRef(
  kind: CatalogKind,
  raw: string,
): string | null {
  const entry =
    kind === "vibe" ? getApprovedVibeEntry(raw) : getApprovedThemeEntry(raw);
  return entry?.musicRef ?? null;
}

/** Snapshot of all approved entries (for UI lists). */
export function getServerCatalogEntries(): {
  themes: ServerCatalogEntry[];
  vibes: ServerCatalogEntry[];
} {
  ensureFreshLazy();
  return { themes: [...themeMap.values()], vibes: [...vibeMap.values()] };
}

// Warm the cache as soon as the module is first imported anywhere in the app
// (resolveThemeDisplay / musicLibrary pull this in early). Fire-and-forget.
void refreshServerCatalog();
