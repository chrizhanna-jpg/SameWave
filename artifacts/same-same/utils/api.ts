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

export async function votePhoto(
  photoId: string,
  verdict: "same" | "different",
): Promise<boolean> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/photos/${photoId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authedHeaders()) },
      body: JSON.stringify({ verdict }),
    });
    return res.ok;
  } catch {
    return false;
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
