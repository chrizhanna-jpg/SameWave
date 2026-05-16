import AsyncStorage from "@react-native-async-storage/async-storage";

import { postDebugSessionLog } from "@/utils/debugSessionLog";
import {
  getPublicApiOrigin,
  getStagedProductionApiOrigin,
  isLocalDevApiOrigin,
} from "@/utils/publicEnv";

// Base URL for the API server (absolute origin, no trailing slash).
// Configure `EXPO_PUBLIC_API_URL` or `EXPO_PUBLIC_DOMAIN` — see `utils/publicEnv.ts`.
function getApiBase(): string {
  return getPublicApiOrigin();
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

// ─────────────────────────────────────────────────────────────────────────
// Clerk auth token
// _layout.tsx wires `setAuthTokenGetter(() => getToken())` once Clerk is
// loaded. Every authenticated request then carries a Bearer JWT alongside
// the legacy X-Device-Id header. The server uses the Bearer to identify
// the user; X-Device-Id is only consulted on the *first* signed-in request
// from a previously-anonymous install so the user keeps their existing
// photos. After the link, X-Device-Id is harmless extra noise.
// ─────────────────────────────────────────────────────────────────────────
let authTokenGetter: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(getter: () => Promise<string | null>): void {
  authTokenGetter = getter;
}

async function authedHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const id = await getDeviceId();
  const headers: Record<string, string> = {
    "X-Device-Id": id,
    ...(extra ?? {}),
  };
  if (authTokenGetter) {
    try {
      const token = await authTokenGetter();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch {
      // No token yet (e.g. during sign-in) — fall through with just the
      // device id; the server will return 401 and the caller decides.
    }
  }
  return headers;
}

// ─────────────────────────────────────────────────────────────────────────
// Existing AI analyzer (unchanged contract).
// ─────────────────────────────────────────────────────────────────────────
export interface PhotoAnalysis {
  tags: string[];
  theme: string;
  /**
   * Visual-form / composition tags returned by the same Gemini pass
   * (circles, vertical, layered…). Always present — empty when the
   * model returns nothing usable. The camera screen does not display
   * shapes today, but uploads forward them so the server can persist
   * `shape_tags` for the candidate scoring rebalance.
   */
  shapes: string[];
  /**
   * Free-form concrete subjects ("apple", "sculpture", "park"…)
   * returned by the same Gemini pass. Up to 6 short noun tokens with
   * no allowlist — this is the axis that lets semantically-similar
   * photos (two apple sculptures, two latte arts) match each other
   * even when they share neither theme nor lifestyle tags. Empty if
   * the model returns nothing usable.
   */
  subjects: string[];
}

const ANALYZE_PHOTO_TIMEOUT_MS = 22_000;

function isOpenAiNotConfiguredError(
  status: number,
  serverError: string | undefined,
): boolean {
  if (status !== 503) return false;
  const s = (serverError ?? "").toLowerCase();
  return s.includes("openai_api_key") || s.includes("photo ai is not configured");
}

async function postAnalyzePhoto(
  base: string,
  input: {
    imageUrl?: string;
    imageBase64?: string;
    mimeType?: string;
  },
  headers: Record<string, string>,
): Promise<{ res: Response; raw: string }> {
  const controller = new AbortController();
  const abortTimer = setTimeout(
    () => controller.abort(),
    ANALYZE_PHOTO_TIMEOUT_MS,
  );
  try {
    const res = await fetch(`${base}/api/analyze-photo`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    const raw = await res.text();
    return { res, raw };
  } finally {
    clearTimeout(abortTimer);
  }
}

export async function analyzePhoto(input: {
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: string;
}): Promise<PhotoAnalysis> {
  const empty: PhotoAnalysis = { tags: [], theme: "", shapes: [], subjects: [] };
  try {
    const primaryBase = getApiBase();
    const headers = await authedHeaders({
      "Content-Type": "application/json",
    });

    let base = primaryBase;
    let { res, raw } = await postAnalyzePhoto(base, input, headers);

    if (
      !res.ok &&
      __DEV__ &&
      isOpenAiNotConfiguredError(
        res.status,
        (() => {
          try {
            const j = JSON.parse(raw) as { error?: unknown };
            return typeof j.error === "string" ? j.error : undefined;
          } catch {
            return undefined;
          }
        })(),
      )
    ) {
      const remote = getStagedProductionApiOrigin();
      if (
        remote &&
        remote !== base &&
        isLocalDevApiOrigin(base)
      ) {
        if (__DEV__) {
          console.warn(
            `[analyzePhoto] local API has no OPENAI_API_KEY — retrying ${remote}/api/analyze-photo`,
          );
        }
        base = remote;
        ({ res, raw } = await postAnalyzePhoto(base, input, headers));
      }
    }

    if (!res.ok) {
      let serverError: string | undefined;
      try {
        const j = JSON.parse(raw) as { error?: unknown };
        if (typeof j.error === "string" && j.error.length > 0) {
          serverError = j.error;
        }
      } catch {
        if (/internal server error/i.test(raw) && raw.trimStart().startsWith("<")) {
          serverError =
            "Server error (often Clerk middleware or a crash before JSON). Redeploy api-server with the latest code, or check Render logs.";
        }
      }
      if (__DEV__) {
        console.warn(
          `[analyzePhoto] ${res.status} ${res.statusText} — ${base}/api/analyze-photo`,
          serverError ?? raw.slice(0, 500),
        );
      }
      const baseHint = __DEV__
        ? `\n\nAPI used: ${base}${
            base !== primaryBase
              ? ` (retried after ${primaryBase})`
              : isLocalDevApiOrigin(base)
                ? getStagedProductionApiOrigin()
                  ? ""
                  : "\nTip: set EXPO_PUBLIC_API_URL=https://samewave.onrender.com (or EXPO_PUBLIC_HOSTED_API_URL) while keeping EXPO_PUBLIC_DEV_API_URL on your LAN IP, then restart Expo (`pnpm dev`). Or add OPENAI_API_KEY to artifacts/api-server/.env."
                : ""
          }`
        : "";
      throw new Error(
        (serverError?.trim() ||
          (res.status === 503
            ? "Photo AI is not available (server is missing OPENAI_API_KEY)."
            : `Photo analysis failed (${res.status}).`)) + baseHint,
      );
    }
    let json: {
      tags?: string[];
      theme?: string;
      shapes?: string[];
      subjects?: string[];
    };
    try {
      json = JSON.parse(raw) as typeof json;
    } catch {
      if (__DEV__) {
        console.warn("[analyzePhoto] invalid JSON body:", raw.slice(0, 300));
      }
      return empty;
    }
    return {
      tags: Array.isArray(json.tags) ? json.tags : [],
      theme: typeof json.theme === "string" ? json.theme : "",
      shapes: Array.isArray(json.shapes) ? json.shapes : [],
      subjects: Array.isArray(json.subjects) ? json.subjects : [],
    };
  } catch (e) {
    const timedOut =
      e instanceof Error &&
      (e.name === "AbortError" || /aborted|AbortError/i.test(e.message));
    // #region agent log
    postDebugSessionLog({
      hypothesisId: timedOut ? "H-analyze-timeout" : "H-analyze-net",
      location: "api.ts:analyzePhoto",
      message: timedOut ? "analyze-photo aborted (timeout)" : "analyze-photo fetch error",
      data: { timedOut },
    });
    // #endregion
    if (__DEV__) {
      console.warn("[analyzePhoto] network or fetch error:", getApiBase(), e);
    }
    if (
      e instanceof Error &&
      /Photo AI is not available|Photo analysis failed|OPENAI_API_KEY|Photo AI is not configured|image too large|invalid mime|provide exactly one of|quota|rate limit|429|exceeded your current/i.test(
        e.message,
      )
    ) {
      throw e;
    }
    throw new Error(
      timedOut
        ? "Photo analysis timed out — try again or use a smaller image."
        : "Couldn't reach the photo server. Check your connection and API URL.",
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Photo CRUD against the live backend.
// ─────────────────────────────────────────────────────────────────────────

export interface UploadedPhoto {
  id: string;
  theme: string;
  tags: string[];
  /**
   * Free-form concrete subjects Gemini saw at upload time. Threaded
   * back to the client so AppContext can stash them on the in-memory
   * `MyPhoto` and the match screen can pass them into /candidates as
   * the `subjects=` query param — that's what unlocks the heaviest
   * subject-overlap scoring axis. Empty if the model returned nothing.
   */
  subjects: string[];
  musicGenre: string | null;
  hasCustomAudio: boolean;
}

export async function uploadPhoto(input: {
  imageBase64: string;
  mimeType?: string;
  countryCode?: string;
  musicGenre?: string;
  /** Optional user-recorded vibe clip — base64-encoded audio. */
  customAudioBase64?: string;
  /** Mime type for the recording (e.g. "audio/m4a", "audio/mp4"). */
  customAudioMime?: string;
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
      subjects: Array.isArray(json.subjects) ? json.subjects : [],
      musicGenre: typeof json.musicGenre === "string" ? json.musicGenre : null,
      hasCustomAudio: json.hasCustomAudio === true,
    };
  } catch {
    return null;
  }
}

export interface CandidatePhoto {
  id: string;
  theme: string;
  tags: string[];
  /**
   * Visual-form / shape tags persisted server-side. Returned so the
   * mobile re-rank can compute shape overlap against the requester's
   * shapes — without it, the local subject-matter score collapses to
   * subject-only (vibe term) and loses the 50/50 split. Empty array
   * for legacy rows uploaded before the shape pass.
   */
  shapeTags: string[];
  /**
   * Free-form concrete subjects ("apple", "sculpture", "park"…)
   * persisted server-side. Surfaced so the local re-rank in
   * scoreCandidates can compute subject overlap and award the
   * heaviest single-axis bonus (3 pts × min(overlap,5) = 0..15).
   * Empty for legacy rows uploaded before the subjects pass / before
   * the backfill ran — those rows still match on the other axes.
   */
  subjects: string[];
  countryCode: string | null;
  /** Music vibe label; null for legacy photos uploaded pre-feature. */
  musicGenre: string | null;
  /**
   * `data:` URL for a user-recorded vibe clip if the uploader added one.
   * When non-null, playback should use this in place of the music_genre
   * clip — same player, just a different URL.
   */
  customAudioUrl: string | null;
  uri: string; // data: URI (MVP) — server returns inline base64
  createdAt: string;
  score: number;
}

export async function fetchCandidates(input: {
  theme?: string;
  tags?: string[];
  /**
   * Visual-form / shape tags (circles, vertical, layered…). Sent
   * alongside `tags` so the server can split the score 50/50 between
   * subject overlap and shape overlap in the secondary "match by
   * subject matter" deck. Optional in the primary deck — adds a soft
   * tie-breaker when the requester's photo has shapes recorded.
   */
  shapes?: string[];
  /**
   * Free-form concrete subjects (apple, sculpture, latte art…) from
   * the requester's own photo. Sent to the server so the matcher can
   * compute concrete-noun overlap — the heaviest single-axis bonus
   * (3 pts × min(overlap,5) = 0..15). Optional but the most important
   * signal the client can pass when present; it's what fixes the
   * "two apple sculptures don't match" failure that the constrained
   * `tags` vocabulary couldn't carry.
   */
  subjects?: string[];
  /**
   * Music vibe id chosen by the user on their own photo. Sent to the
   * server so the candidate scoring can boost rows with the same
   * music vibe — strengthens the "match by vibe + theme" intent of
   * the primary deck.
   */
  musicGenre?: string;
  limit?: number;
  /**
   * Backend photo IDs the client knows the user has already been shown.
   * Hard-excluded server-side regardless of the server's own seen_photos
   * table — this is the safety net for the previous failure mode where
   * a fire-and-forget `markPhotosSeen` POST dropped on a flaky network
   * and the same photo would resurface on the next fetch. The client
   * caps the slice it sends so the URL stays well under proxy limits.
   */
  excludeIds?: string[];
}): Promise<CandidatePhoto[]> {
  try {
    const base = getApiBase();
    const params = new URLSearchParams();
    if (input.theme) params.set("theme", input.theme);
    if (input.tags && input.tags.length > 0) params.set("tags", input.tags.join(","));
    if (input.shapes && input.shapes.length > 0) {
      params.set("shapes", input.shapes.join(","));
    }
    if (input.subjects && input.subjects.length > 0) {
      params.set("subjects", input.subjects.join(","));
    }
    if (input.musicGenre) params.set("musicGenre", input.musicGenre);
    if (input.limit) params.set("limit", String(input.limit));
    if (input.excludeIds && input.excludeIds.length > 0) {
      // Cap defensively — the server caps too, but trimming here also
      // keeps the URL short. 150 IDs × ~36 chars ≈ 5.5 KB, comfortably
      // under typical 8 KB proxy URL limits.
      const capped = input.excludeIds.slice(-150);
      params.set("excludeIds", capped.join(","));
    }
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

/**
 * Ask the server to re-tag the user's own photo using object-focused
 * AI vision. Resolves to up to 6 detected object tags from the fixed
 * vocabulary; an empty array means the model ran successfully but
 * couldn't identify anything (e.g. abstract photo, text-only image).
 *
 * Throws on transport / server errors so the swipe screen can tell
 * "AI saw nothing" apart from "network or server failed" — the two
 * deserve different copy in the UI.
 */
/**
 * Result of a "match by subject matter" extraction. Contains both the
 * concrete subjects/objects Gemini saw (people, plants, food, sky…)
 * and the visual-form / shape tags (circles, vertical, layered…) that
 * round out the secondary deck's 50/50 score split.
 */
export interface MatchByObjectResult {
  objects: string[];
  shapes: string[];
}

export async function matchByObject(
  photoId: string,
): Promise<MatchByObjectResult> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/photos/match-by-object`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authedHeaders()),
    },
    body: JSON.stringify({ photoId }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    objects?: string[];
    shapes?: string[];
  };
  if (!res.ok) {
    const hint =
      typeof json.error === "string" && json.error.length > 0
        ? json.error
        : res.statusText;
    throw new Error(`match-by-object failed (${res.status}): ${hint}`);
  }
  return {
    objects: Array.isArray(json.objects) ? json.objects : [],
    shapes: Array.isArray(json.shapes) ? json.shapes : [],
  };
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

/**
 * Withdraw a previously-cast vote on this photo. Used when the user
 * taps "Mark as Different" on a ripple in My Journey, or otherwise
 * undoes a swipe. The server cascades to dissolve any wave (mutual
 * echo) the original "same" vote was holding together — undoing a
 * ripple is the only way a wave can be cancelled, by design.
 *
 * Returns true on any 2xx (including the no-op case where the user
 * had no vote on file). Network or 5xx failures return false so the
 * caller can decide whether to keep the local UI flip or roll back.
 */
export async function unvotePhoto(photoId: string): Promise<boolean> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/photos/${photoId}/unvote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authedHeaders()) },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Seen-photos ledger (server-side mirror of the client's seenPhotoKeys).
// Lets dedup follow the user across reinstalls / a second device.
// ─────────────────────────────────────────────────────────────────────────

/** Bulk-mark photos as seen by the current user. Best-effort, idempotent. */
export async function markPhotosSeen(photoIds: string[]): Promise<boolean> {
  if (!photoIds || photoIds.length === 0) return true;
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/photos/seen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authedHeaders()) },
      body: JSON.stringify({ photoIds }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fetch the IDs of every photo the current user has seen or voted on. */
export async function fetchSeenPhotoIds(): Promise<string[]> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/photos/seen`, {
      headers: await authedHeaders(),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { photoIds?: unknown };
    return Array.isArray(json.photoIds)
      ? json.photoIds.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
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
  // Data URL (`data:audio/...;base64,...`) for the custom voice clip
  // attached to this photo, if any. The mic badge on the relevant
  // surfaces uses this URL to drive the play/pause preview.
  customAudioUrl: string | null;
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
  customAudioBase64?: string | null;
  customAudioMime?: string | null;
}): ServerEchoSide {
  const code = (side.countryCode ?? "").toUpperCase();
  const audio =
    side.customAudioBase64 && side.customAudioMime
      ? `data:${side.customAudioMime};base64,${side.customAudioBase64}`
      : null;
  return {
    id: side.id,
    uri: side.uri,
    countryCode: code || null,
    country: code ? nameFor(code) ?? "Somewhere" : "Somewhere",
    countryFlag: code ? flagFor(code) : "🌍",
    customAudioUrl: audio,
  };
}

function decorateEcho(raw: {
  id: string;
  state: string;
  theme: string;
  createdAt: string;
  mutualAt: string | null;
  mine: {
    id: string;
    uri: string;
    countryCode: string | null;
    customAudioBase64?: string | null;
    customAudioMime?: string | null;
  };
  theirs: {
    id: string;
    uri: string;
    countryCode: string | null;
    customAudioBase64?: string | null;
    customAudioMime?: string | null;
  };
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

export interface ThemeEchoPhoto {
  echoId: string;
  theme: string;
  mutualAt: string | null;
  photo: ServerEchoSide;
  // ID of the other photo in this pair, used to deep-link into the
  // read-only `/echo-pair?a=&b=` view from a single tile tap.
  partnerPhotoId: string;
}

export async function fetchEchoesByTheme(theme: string): Promise<{
  theme: string;
  count: number;
  photos: ThemeEchoPhoto[];
}> {
  try {
    const base = getApiBase();
    const res = await fetch(
      `${base}/api/echoes/theme/${encodeURIComponent(theme)}`,
    );
    if (!res.ok) return { theme, count: 0, photos: [] };
    const json = (await res.json()) as {
      theme?: string;
      count?: number;
      photos?: Array<{
        echoId: string;
        theme: string;
        mutualAt: string | null;
        photo: {
          id: string;
          uri: string;
          countryCode: string | null;
          customAudioBase64?: string | null;
          customAudioMime?: string | null;
        };
        partnerPhotoId: string;
      }>;
    };
    const photos = Array.isArray(json.photos)
      ? json.photos.map((p) => ({
          echoId: p.echoId,
          theme: p.theme ?? theme,
          mutualAt: p.mutualAt ?? null,
          photo: decorateSide(p.photo),
          partnerPhotoId: p.partnerPhotoId,
        }))
      : [];
    return {
      theme: json.theme ?? theme,
      count: json.count ?? Math.floor(photos.length / 2),
      photos,
    };
  } catch {
    return { theme, count: 0, photos: [] };
  }
}

export interface PhotoPairSide extends ServerEchoSide {
  theme: string;
  tags: string[];
  musicGenre: string | null;
  createdAt: string | null;
  // customAudioUrl is inherited from ServerEchoSide.
}

export interface PhotoPairResult {
  mutualAt: string | null;
  a: PhotoPairSide;
  b: PhotoPairSide;
}

export async function fetchPair(aId: string, bId: string): Promise<PhotoPairResult | null> {
  try {
    const base = getApiBase();
    const res = await fetch(
      `${base}/api/echoes/pair?a=${encodeURIComponent(aId)}&b=${encodeURIComponent(bId)}`,
      { headers: await authedHeaders() },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      mutualAt?: string | null;
      a?: {
        id: string;
        uri: string;
        countryCode: string | null;
        theme: string;
        tags?: string[];
        musicGenre?: string | null;
        createdAt?: string | null;
        customAudioBase64?: string | null;
        customAudioMime?: string | null;
      };
      b?: {
        id: string;
        uri: string;
        countryCode: string | null;
        theme: string;
        tags?: string[];
        musicGenre?: string | null;
        createdAt?: string | null;
        customAudioBase64?: string | null;
        customAudioMime?: string | null;
      };
    };
    if (!json.a || !json.b) return null;
    const decorate = (
      raw: NonNullable<typeof json.a>,
    ): PhotoPairSide => ({
      ...decorateSide(raw),
      theme: raw.theme ?? "",
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      musicGenre: raw.musicGenre ?? null,
      createdAt: raw.createdAt ?? null,
    });
    // ^ decorateSide handles customAudioUrl from the base64+mime fields.
    return {
      mutualAt: json.mutualAt ?? null,
      a: decorate(json.a),
      b: decorate(json.b),
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Push tokens — Expo Push API delivery to this device.
// ─────────────────────────────────────────────────────────────────────────

export async function registerPushToken(input: {
  token: string;
  platform?: "ios" | "android" | "web";
}): Promise<boolean> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/push-tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authedHeaders()) },
      body: JSON.stringify({
        token: input.token,
        platform: input.platform ?? "unknown",
      }),
    });
    return res.ok;
  } catch {
    return false;
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

// ─────────────────────────────────────────────────────────────────────────
// Atlas — world map of photos by country.
// ─────────────────────────────────────────────────────────────────────────

export interface AtlasCountry {
  code: string;
  count: number;
}

/** Pending echo (ripple) or mutual echo (wave) for Atlas arc overlay. */
export interface AtlasConnection {
  id: string;
  kind: "ripple" | "wave";
  from: string;
  to: string;
  /** Ripple created in the last 48h (slightly brighter arc). */
  fresh?: boolean;
  /** ISO 8601 from server (echo created / mutual time). */
  createdAt: string;
  /** Echo theme string (Wavefire clustering + palette input). */
  theme: string;
  /** Merged lifestyle tags from both photos in the echo (Wavefire vibe links). */
  tags: string[];
  /** Merged free-form subjects from both photos (Wavefire subject links). */
  subjects: string[];
  /** Line colour from server (HSL / hex). */
  color: string;
  /**
   * When the request is authenticated, true if the viewer initiated this
   * ripple or participates in this wave.
   */
  mine?: boolean;
  /** Optional — same-origin thumbnail for Wavefire Firecircle tiles. */
  userId?: string;
  thumbnailUrl?: string;
}

export interface AtlasSummaryPayload {
  countries: AtlasCountry[];
  connections: AtlasConnection[];
}

/** Set when the Atlas summary request failed (distinct from an empty world). */
export type AtlasSummaryLoadError = "unauthorized" | "server" | "network";

/** Safe on-screen / log details (no tokens). */
export type AtlasSummaryLoadFailure = {
  category: "network" | "http";
  status?: number;
  /** Short server message or thrown Error.message. */
  detail?: string;
  /** Host portion of the API origin we called (sanity-check wrong env). */
  apiHost: string;
};

export type AtlasSummaryResult = AtlasSummaryPayload & {
  loadError?: AtlasSummaryLoadError;
  loadFailure?: AtlasSummaryLoadFailure;
};

function atlasApiHostForDisplay(base: string): string {
  try {
    return new URL(base).host;
  } catch {
    return base.replace(/\s+/g, " ").slice(0, 56);
  }
}

function atlasSanitizeDetail(s: string, max = 200): string {
  return s.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Atlas aggregates can be slow over LAN / cold Postgres; generous but not indefinite. */
const ATLAS_FETCH_TIMEOUT_MS = 30_000;

function atlasTimeoutResult(apiHost: string): AtlasSummaryResult {
  return {
    countries: [],
    connections: [],
    loadError: "network",
    loadFailure: {
      category: "network",
      apiHost,
      detail:
        "Request timed out (30s). Check DATABASE_URL / Postgres, LAN, EXPO_PUBLIC_DEV_API_URL, and that api-server is running.",
    },
  };
}

/** Country counts plus live ripple / wave pairs for the Atlas map. */
export async function fetchAtlasSummary(): Promise<AtlasSummaryResult> {
  const base = getApiBase();
  const apiHost = atlasApiHostForDisplay(base);
  return Promise.race([
    fetchAtlasSummaryOnce(base, apiHost),
    new Promise<AtlasSummaryResult>((resolve) => {
      setTimeout(() => resolve(atlasTimeoutResult(apiHost)), ATLAS_FETCH_TIMEOUT_MS);
    }),
  ]);
}

async function fetchAtlasSummaryOnce(
  base: string,
  apiHost: string,
): Promise<AtlasSummaryResult> {
  try {
    const res = await fetch(`${base}/api/photos/atlas`, {
      headers: await authedHeaders(),
      cache: "no-store",
    });
    if (!res.ok) {
      const err: AtlasSummaryLoadError =
        res.status === 401 ? "unauthorized" : "server";
      let detail: string | undefined;
      try {
        const t = await res.text();
        try {
          const j = JSON.parse(t) as { error?: unknown };
          if (typeof j.error === "string" && j.error.length > 0) {
            detail = atlasSanitizeDetail(j.error);
          }
        } catch {
          if (t.length > 0) detail = atlasSanitizeDetail(t);
        }
      } catch {
        /* ignore body read errors */
      }
      const loadFailure: AtlasSummaryLoadFailure = {
        category: "http",
        status: res.status,
        detail,
        apiHost,
      };
      // #region agent log
      postDebugSessionLog({
        hypothesisId: "H-atlas-http",
        location: "api.ts:fetchAtlasSummary",
        message: "atlas non-ok",
        data: {
          status: res.status,
          apiHost,
          detailLen: detail?.length ?? 0,
        },
      });
      // #endregion
      if (__DEV__) {
        const hint =
          res.status === 401
            ? "Atlas requires a signed-in session (Bearer token)."
            : `HTTP ${res.status}${detail ? `: ${detail}` : ""}`;
        console.warn(`[fetchAtlasSummary] ${hint}`, `${base}/api/photos/atlas`);
      }
      return {
        countries: [],
        connections: [],
        loadError: err,
        loadFailure,
      };
    }
    const json = (await res.json()) as {
      countries?: AtlasCountry[];
      connections?: AtlasConnection[];
    };
    const countries = Array.isArray(json.countries) ? json.countries : [];
    const connectionsRaw = Array.isArray(json.connections)
      ? json.connections
      : [];
    const connections: AtlasConnection[] = connectionsRaw
      .filter(
        (c): c is AtlasConnection =>
          typeof c === "object" &&
          c !== null &&
          typeof (c as AtlasConnection).id === "string" &&
          ((c as AtlasConnection).kind === "ripple" ||
            (c as AtlasConnection).kind === "wave") &&
          typeof (c as AtlasConnection).from === "string" &&
          typeof (c as AtlasConnection).to === "string",
      )
      .map((c) => ({
        id: c.id,
        kind: c.kind,
        from: c.from,
        to: c.to,
        fresh: c.fresh === true,
        createdAt:
          typeof c.createdAt === "string" && c.createdAt.length > 0
            ? c.createdAt
            : new Date(0).toISOString(),
        theme: typeof c.theme === "string" ? c.theme : "",
        tags: Array.isArray(c.tags)
          ? c.tags.filter((t): t is string => typeof t === "string")
          : [],
        subjects: Array.isArray(c.subjects)
          ? c.subjects.filter((t): t is string => typeof t === "string")
          : [],
        color:
          typeof c.color === "string" && c.color.length > 0
            ? c.color
            : c.kind === "wave"
              ? "#FFD166"
              : "#4FD89C",
        mine: c.mine === true ? true : undefined,
        userId:
          typeof c.userId === "string" && c.userId.trim().length > 0
            ? c.userId.trim()
            : undefined,
        thumbnailUrl:
          typeof c.thumbnailUrl === "string" && c.thumbnailUrl.trim().length > 0
            ? c.thumbnailUrl.trim()
            : undefined,
      }));
    // #region agent log
    postDebugSessionLog({
      hypothesisId: "H-atlas-ok",
      location: "api.ts:fetchAtlasSummary",
      message: "atlas ok",
      data: {
        apiHost,
        countries: countries.length,
        connections: connections.length,
      },
    });
    // #endregion
    return { countries, connections };
  } catch (e) {
    const aborted =
      e instanceof Error &&
      (e.name === "AbortError" ||
        /aborted|AbortError/i.test(String(e.message)) ||
        String(e.message).includes("cancel"));
    const detail = aborted
      ? "Request timed out (30s). Check DATABASE_URL / Postgres, LAN, EXPO_PUBLIC_DEV_API_URL, and api-server."
      : e instanceof Error
        ? atlasSanitizeDetail(e.message)
        : atlasSanitizeDetail(String(e));
    const loadFailure: AtlasSummaryLoadFailure = {
      category: "network",
      detail: detail || undefined,
      apiHost,
    };
    // #region agent log
    postDebugSessionLog({
      hypothesisId: "H-atlas-net",
      location: "api.ts:fetchAtlasSummary",
      message: "atlas fetch threw",
      data: { apiHost, detailLen: detail.length },
    });
    // #endregion
    if (__DEV__) {
      console.warn(
        "[fetchAtlasSummary] network error — check EXPO_PUBLIC_API_URL / device can reach API",
        base,
        e,
      );
    }
    return {
      countries: [],
      connections: [],
      loadError: "network",
      loadFailure,
    };
  }
}

const ATLAS_DIAG_FETCH_TIMEOUT_MS = 12_000;

async function atlasDiagFetch(url: string, timeoutMs: number): Promise<{
  ms: number;
  ok: boolean;
  status: number;
  text: string;
  aborted?: boolean;
}> {
  const t0 = Date.now();
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    return {
      ms: Date.now() - t0,
      ok: res.ok,
      status: res.status,
      text,
    };
  } catch (e) {
    const aborted =
      e instanceof Error &&
      (e.name === "AbortError" || /abort/i.test(String(e.message)));
    return {
      ms: Date.now() - t0,
      ok: false,
      status: 0,
      text:
        e instanceof Error
          ? atlasSanitizeDetail(e.message)
          : atlasSanitizeDetail(String(e)),
      aborted,
    };
  } finally {
    clearTimeout(tid);
  }
}

export interface BackendStatusPayload {
  timestamp: number;
  databaseReachable: boolean;
  databaseError?: string | null;
  clerkSecretConfigured: boolean;
  clerkPublishableConfigured: boolean;
  openAiConfigured: boolean;
}

/**
 * Lightweight checks Atlas tab can show when loading fails — no tokens/keys echoed.
 */
export async function fetchAtlasTabDiagnostics(): Promise<{
  apiBase: string;
  health?: { ms: number; ok: boolean; status: number; bodyPreview?: string };
  backendStatus?: BackendStatusPayload;
  backendStatusFetch?: {
    ms: number;
    ok: boolean;
    status: number;
    bodyPreview: string;
    aborted?: boolean;
  };
  atlas?: {
    ms: number;
    ok: boolean;
    status: number;
    bodyPreview: string;
    aborted?: boolean;
  };
}> {
  const apiBase = getApiBase();

  const health = await atlasDiagFetch(
    `${apiBase}/api/healthz`,
    ATLAS_DIAG_FETCH_TIMEOUT_MS,
  );

  const statusFetch = await atlasDiagFetch(
    `${apiBase}/api/public/backend-status`,
    ATLAS_DIAG_FETCH_TIMEOUT_MS,
  );

  let backendStatus: BackendStatusPayload | undefined;
  if (statusFetch.ok && statusFetch.text) {
    try {
      backendStatus = JSON.parse(statusFetch.text) as BackendStatusPayload;
    } catch {
      /* ignore */
    }
  }

  const atlas = await atlasDiagFetch(
    `${apiBase}/api/photos/atlas`,
    ATLAS_DIAG_FETCH_TIMEOUT_MS,
  );

  return {
    apiBase,
    health: {
      ms: health.ms,
      ok: health.ok,
      status: health.status,
      bodyPreview: health.text.slice(0, 400),
    },
    backendStatus,
    backendStatusFetch: {
      ms: statusFetch.ms,
      ok: statusFetch.ok,
      status: statusFetch.status,
      bodyPreview: statusFetch.text.slice(0, 800),
      aborted: statusFetch.aborted,
    },
    atlas: {
      ms: atlas.ms,
      ok: atlas.ok,
      status: atlas.status,
      bodyPreview: atlas.text.slice(0, 700),
      aborted: atlas.aborted,
    },
  };
}

export interface AtlasPhoto {
  id: string;
  uri: string;
  theme: string;
  tags: string[];
  musicGenre: string | null;
  customAudioUrl: string | null;
  createdAt: string;
}

/** Returns up to 30 recent photos for a given country code. */
export async function fetchAtlasCountryPhotos(
  countryCode: string,
): Promise<AtlasPhoto[]> {
  try {
    const base = getApiBase();
    const res = await fetch(
      `${base}/api/photos/atlas/${encodeURIComponent(countryCode)}`,
      { headers: await authedHeaders(), cache: "no-store" },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { photos?: AtlasPhoto[] };
    return Array.isArray(json.photos) ? json.photos : [];
  } catch {
    return [];
  }
}
