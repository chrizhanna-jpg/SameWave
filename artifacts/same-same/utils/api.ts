import AsyncStorage from "@react-native-async-storage/async-storage";

// Base URL for the API server. The Expo app uses the expo-domain router so
// it doesn't share a host with the api-server — we need an absolute URL.
// In development, EXPO_PUBLIC_DOMAIN is set by the dev script and points at
// the workspace's REPLIT_DEV_DOMAIN, which proxies /api → the api-server.
function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) {
    const stripped = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${stripped}`;
  }
  return "";
}

// ─────────────────────────────────────────────────────────────────────────
// Device ID
// We don't have user accounts in MVP. A stable per-install UUID, stored in
// AsyncStorage and sent on every photo API call, is the user's identity.
// (Phase 2 will overlay this with Clerk Google sign-in.)
// ─────────────────────────────────────────────────────────────────────────
const DEVICE_ID_KEY = "samesame_device_id";
let deviceIdCache: string | null = null;

function generateUuidV4(): string {
  // Crypto-quality UUID isn't required (this is just a routing key, not
  // an auth token). Math.random is fine and avoids a polyfill dependency.
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += "-";
    else if (i === 14) s += "4";
    else if (i === 19) s += hex[(Math.random() * 4) | 0 | 8];
    else s += hex[(Math.random() * 16) | 0];
  }
  return s;
}

export async function getDeviceId(): Promise<string> {
  if (deviceIdCache) return deviceIdCache;
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored && stored.length >= 12) {
      deviceIdCache = stored;
      return stored;
    }
  } catch {}
  const fresh = generateUuidV4();
  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, fresh);
  } catch {}
  deviceIdCache = fresh;
  return fresh;
}

async function authedHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const id = await getDeviceId();
  return { "X-Device-Id": id, ...(extra ?? {}) };
}

// ─────────────────────────────────────────────────────────────────────────
// Existing AI analyzer (unchanged contract).
// ─────────────────────────────────────────────────────────────────────────
export interface PhotoAnalysis {
  tags: string[];
  theme: string;
}

export async function analyzePhoto(input: {
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: string;
}): Promise<PhotoAnalysis> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/analyze-photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return { tags: [], theme: "" };
    const json = (await res.json()) as { tags?: string[]; theme?: string };
    return {
      tags: Array.isArray(json.tags) ? json.tags : [],
      theme: typeof json.theme === "string" ? json.theme : "",
    };
  } catch {
    return { tags: [], theme: "" };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Photo CRUD against the live backend.
// ─────────────────────────────────────────────────────────────────────────

export interface UploadedPhoto {
  id: string;
  theme: string;
  tags: string[];
}

export async function uploadPhoto(input: {
  imageBase64: string;
  mimeType?: string;
  countryCode?: string;
}): Promise<UploadedPhoto | null> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authedHeaders()) },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Partial<UploadedPhoto>;
    if (!json.id) return null;
    return {
      id: json.id,
      theme: json.theme ?? "",
      tags: Array.isArray(json.tags) ? json.tags : [],
    };
  } catch {
    return null;
  }
}

export interface CandidatePhoto {
  id: string;
  theme: string;
  tags: string[];
  countryCode: string | null;
  uri: string; // data: URI (MVP) — server returns inline base64
  createdAt: string;
  score: number;
}

export async function fetchCandidates(input: {
  theme?: string;
  tags?: string[];
  limit?: number;
}): Promise<CandidatePhoto[]> {
  try {
    const base = getApiBase();
    const params = new URLSearchParams();
    if (input.theme) params.set("theme", input.theme);
    if (input.tags && input.tags.length > 0) params.set("tags", input.tags.join(","));
    if (input.limit) params.set("limit", String(input.limit));
    const res = await fetch(`${base}/api/photos/candidates?${params.toString()}`, {
      headers: await authedHeaders(),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { photos?: CandidatePhoto[] };
    return Array.isArray(json.photos) ? json.photos : [];
  } catch {
    return [];
  }
}

export interface VoteResult {
  ok: boolean;
  /**
   * Did this vote create or promote an echo offer? "skipped" when no
   * voterPhotoId was sent (or self-vote / missing photo). "pending" when
   * we recorded a one-way offer. "mutual" when the other side had
   * already offered and this vote completes the loop.
   */
  echo: "pending" | "mutual" | "skipped";
}

/**
 * Cast a vote on someone else's photo. When `voterPhotoId` is supplied,
 * the server also creates / promotes an echo offer between the two
 * photos (skipped silently for self-votes or missing photos).
 */
export async function votePhoto(
  photoId: string,
  verdict: "same" | "different",
  voterPhotoId?: string,
): Promise<VoteResult> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/photos/${photoId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authedHeaders()) },
      body: JSON.stringify({ verdict, voterPhotoId: voterPhotoId ?? null }),
    });
    if (!res.ok) return { ok: false, echo: "skipped" };
    const json = (await res.json().catch(() => ({}))) as { echo?: string };
    const echo =
      json.echo === "mutual" || json.echo === "pending" ? json.echo : "skipped";
    return { ok: true, echo };
  } catch {
    return { ok: false, echo: "skipped" };
  }
}

export interface MatchStats {
  sameLastHour: number;
  sameLastDay: number;
  sameAllTime: number;
}

// How many other people swiped "same same" on this photo, broken down by
// time window. Used by the reveal screen and discovery feed to show the
// social weight of a match. Returns zeros on error (the UI then hides the
// stat row entirely so we never show a misleading "0 others").
export async function fetchMatchStats(photoId: string): Promise<MatchStats> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/photos/${photoId}/match-stats`, {
      headers: await authedHeaders(),
    });
    if (!res.ok) return { sameLastHour: 0, sameLastDay: 0, sameAllTime: 0 };
    const json = (await res.json()) as Partial<MatchStats>;
    return {
      sameLastHour: Number(json.sameLastHour ?? 0),
      sameLastDay: Number(json.sameLastDay ?? 0),
      sameAllTime: Number(json.sameAllTime ?? 0),
    };
  } catch {
    return { sameLastHour: 0, sameLastDay: 0, sameAllTime: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Echoes — server-backed reciprocation loop.
// ─────────────────────────────────────────────────────────────────────────

export interface ServerEchoSide {
  id: string;
  uri: string;
  countryCode: string | null;
  country: string;
  countryFlag: string;
}

export interface ServerEcho {
  id: string;
  state: "pending" | "mutual";
  theme: string;
  createdAt: string;
  mutualAt: string | null;
  mine: ServerEchoSide;
  theirs: ServerEchoSide;
}

// Map ISO-3166-1 alpha-2 → display name + flag emoji. Mirrors the same
// helpers used elsewhere on mobile so all surfaces show identical labels.
import { flagFor, nameFor } from "@/data/countries";

function decorateSide(side: {
  id: string;
  uri: string;
  countryCode: string | null;
}): ServerEchoSide {
  const code = (side.countryCode ?? "").toUpperCase();
  return {
    id: side.id,
    uri: side.uri,
    countryCode: code || null,
    country: code ? nameFor(code) ?? "Somewhere" : "Somewhere",
    countryFlag: code ? flagFor(code) : "🌍",
  };
}

function decorateEcho(raw: {
  id: string;
  state: string;
  theme: string;
  createdAt: string;
  mutualAt: string | null;
  mine: { id: string; uri: string; countryCode: string | null };
  theirs: { id: string; uri: string; countryCode: string | null };
}): ServerEcho {
  return {
    id: raw.id,
    state: raw.state === "mutual" ? "mutual" : "pending",
    theme: raw.theme ?? "",
    createdAt: raw.createdAt,
    mutualAt: raw.mutualAt ?? null,
    mine: decorateSide(raw.mine),
    theirs: decorateSide(raw.theirs),
  };
}

export async function fetchEchoesInbox(): Promise<ServerEcho[]> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/echoes/inbox`, {
      headers: await authedHeaders(),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { echoes?: unknown[] };
    return Array.isArray(json.echoes)
      ? json.echoes.map((e) => decorateEcho(e as Parameters<typeof decorateEcho>[0]))
      : [];
  } catch {
    return [];
  }
}

export async function fetchEchoesMine(): Promise<ServerEcho[]> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/echoes/mine`, {
      headers: await authedHeaders(),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { echoes?: unknown[] };
    return Array.isArray(json.echoes)
      ? json.echoes.map((e) => decorateEcho(e as Parameters<typeof decorateEcho>[0]))
      : [];
  } catch {
    return [];
  }
}

export async function respondEcho(
  id: string,
  verdict: "same" | "different",
): Promise<{ ok: boolean; state: "mutual" | "declined" | "unknown" }> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/echoes/${id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authedHeaders()) },
      body: JSON.stringify({ verdict }),
    });
    if (!res.ok) return { ok: false, state: "unknown" };
    const json = (await res.json().catch(() => ({}))) as { state?: string };
    const state =
      json.state === "mutual"
        ? "mutual"
        : json.state === "declined"
        ? "declined"
        : "unknown";
    return { ok: true, state };
  } catch {
    return { ok: false, state: "unknown" };
  }
}

export interface ThemeEchoCount {
  theme: string;
  count: number;
}

export async function fetchEchoCountsByTheme(): Promise<ThemeEchoCount[]> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/echoes/by-theme`);
    if (!res.ok) return [];
    const json = (await res.json()) as { themes?: ThemeEchoCount[] };
    return Array.isArray(json.themes) ? json.themes : [];
  } catch {
    return [];
  }
}

export interface ThemeEchoPair {
  echoId: string;
  theme: string;
  mutualAt: string | null;
  a: ServerEchoSide;
  b: ServerEchoSide;
}

export async function fetchEchoesByTheme(theme: string): Promise<{
  theme: string;
  count: number;
  pairs: ThemeEchoPair[];
}> {
  try {
    const base = getApiBase();
    const res = await fetch(
      `${base}/api/echoes/theme/${encodeURIComponent(theme)}`,
    );
    if (!res.ok) return { theme, count: 0, pairs: [] };
    const json = (await res.json()) as {
      theme?: string;
      count?: number;
      pairs?: Array<{
        echoId: string;
        theme: string;
        mutualAt: string | null;
        a: { id: string; uri: string; countryCode: string | null };
        b: { id: string; uri: string; countryCode: string | null };
      }>;
    };
    const pairs = Array.isArray(json.pairs)
      ? json.pairs.map((p) => ({
          echoId: p.echoId,
          theme: p.theme ?? theme,
          mutualAt: p.mutualAt ?? null,
          a: decorateSide(p.a),
          b: decorateSide(p.b),
        }))
      : [];
    return { theme: json.theme ?? theme, count: json.count ?? pairs.length, pairs };
  } catch {
    return { theme, count: 0, pairs: [] };
  }
}

export interface PhotoPairResult {
  a: ServerEchoSide & { theme: string };
  b: ServerEchoSide & { theme: string };
}

export async function fetchPair(aId: string, bId: string): Promise<PhotoPairResult | null> {
  try {
    const base = getApiBase();
    const res = await fetch(
      `${base}/api/echoes/pair?a=${encodeURIComponent(aId)}&b=${encodeURIComponent(bId)}`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      a?: { id: string; uri: string; countryCode: string | null; theme: string };
      b?: { id: string; uri: string; countryCode: string | null; theme: string };
    };
    if (!json.a || !json.b) return null;
    return {
      a: { ...decorateSide(json.a), theme: json.a.theme ?? "" },
      b: { ...decorateSide(json.b), theme: json.b.theme ?? "" },
    };
  } catch {
    return null;
  }
}

export async function reportPhoto(photoId: string, reason?: string): Promise<boolean> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/photos/${photoId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authedHeaders()) },
      body: JSON.stringify({ reason: reason ?? null }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
