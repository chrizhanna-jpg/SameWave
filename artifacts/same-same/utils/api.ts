import AsyncStorage from "@react-native-async-storage/async-storage";

import { postDebugSessionLog } from "@/utils/debugSessionLog";
import type { ServerJourneyMatch } from "@/utils/journeySync";
import { resolveMatchPhotoUris } from "@/utils/matchPhotoSnapshot";
import { photoKey } from "@/utils/photoKey";
import { withDisplayPhotoWidth, serverPhotoImageUrlAtOrigin } from "@/utils/photoDisplayUri";
import { clusterThemesAlign } from "@/utils/atlasWavefire";
import {
  ATLAS_SOMEWHERE_ISO,
  resolveTheirAtlasIso2,
} from "@/utils/atlasLocalRipples";
import { isThemeOnTopic, resolveChallengeThemeId } from "@/data/themeMatch";
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

/** Bearer headers for authenticated image URLs (`/api/photos/:id/image`). */
let authedImageHeadersCache: {
  headers: Record<string, string>;
  fetchedAt: number;
} | null = null;
// Clerk session JWTs are short-lived (~60s). The 5-minute cache we used to
// keep here meant a header set warmed early in a tab session would carry an
// already-expired Bearer for minutes, and every `/api/photos/:id/image`
// request would 401 until the cache aged out — the "your photo stays blank"
// failure. Keep the cache short so a stale token is corrected quickly, and
// pair it with `refreshAuthedImageHeaders()` for an explicit 401 re-warm.
const AUTH_IMAGE_HEADERS_TTL_MS = 60 * 1000;

/** Synchronous read of cached auth headers (for instant image mount when cache is warm). */
export function peekAuthedImageHeaders(): Record<string, string> | undefined {
  const now = Date.now();
  if (
    authedImageHeadersCache &&
    now - authedImageHeadersCache.fetchedAt < AUTH_IMAGE_HEADERS_TTL_MS
  ) {
    return authedImageHeadersCache.headers;
  }
  return undefined;
}

/** Fire-and-forget warm-up — call on Atlas / Ripple tab focus. */
export function warmAuthedImageHeaders(): void {
  void authedImageHeaders().catch(() => {});
}

/**
 * Force a fresh fetch of the auth headers, bypassing (and overwriting) the
 * TTL cache. Call this after an authed image request 401s: the cached Bearer
 * may have expired, and re-reading it from the cache would just resend the
 * same dead token. `authTokenGetter` (Clerk `getToken()`) hands back a fresh,
 * unexpired JWT here, so the immediate retry can succeed.
 */
export async function refreshAuthedImageHeaders(): Promise<
  Record<string, string>
> {
  const headers = await authedHeaders();
  authedImageHeadersCache = { headers, fetchedAt: Date.now() };
  return headers;
}

export async function authedImageHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const now = Date.now();
  if (
    !extra &&
    authedImageHeadersCache &&
    now - authedImageHeadersCache.fetchedAt < AUTH_IMAGE_HEADERS_TTL_MS
  ) {
    return authedImageHeadersCache.headers;
  }
  const headers = await authedHeaders(extra);
  if (!extra) {
    authedImageHeadersCache = { headers, fetchedAt: now };
  }
  return headers;
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
   * Concrete subjects for /candidates subject-overlap scoring.
   * Derived from user tags + rule-based hints when vision is off.
   */
  subjects: string[];
  musicGenre: string | null;
  hasCustomAudio: boolean;
  /** Server rule-based alternate when tags fit another daily theme better. */
  suggestedTheme?: string;
  suggestedTags?: string[];
}

export async function uploadPhoto(input: {
  imageBase64: string;
  mimeType?: string;
  countryCode?: string;
  /** Coarse GPS country at in-app camera capture — omitted for library picks. */
  captureCountryCode?: string;
  /**
   * Real capture time (ISO) — EXIF DateTimeOriginal for library picks, or the
   * in-app camera shutter instant. Omitted when no capture metadata exists;
   * the server then stores null and the temporal tier falls back to share time.
   */
  capturedAt?: string;
  musicGenre?: string;
  /** Optional user-recorded vibe clip — base64-encoded audio. */
  customAudioBase64?: string;
  /** Mime type for the recording (e.g. "audio/m4a", "audio/mp4"). */
  customAudioMime?: string;
  /** User-chosen daily theme — stored as primary; server may suggest otherwise. */
  theme?: string;
  tags?: string[];
  subjects?: string[];
  shapes?: string[];
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
      suggestedTheme:
        typeof json.suggestedTheme === "string" ? json.suggestedTheme : undefined,
      suggestedTags: Array.isArray(json.suggestedTags)
        ? json.suggestedTags.filter((t): t is string => typeof t === "string")
        : undefined,
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
  captureCountryCode: string | null;
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
  /**
   * Real capture time (ISO) of the candidate's photo, or null when unknown.
   * The match screen snapshots `capturedAt ?? createdAt` as the candidate's
   * temporal-match basis so the tier is computed from a fixed instant.
   */
  capturedAt: string | null;
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
    if (!Array.isArray(json.photos)) return [];
    // Geo-tier policy: a candidate's effective capture country is its real
    // GPS capture if known, otherwise the uploader's declared home country.
    // We normalise it here (rather than in the swipe screen) so every
    // consumer reading `captureCountryCode` reaches the Same Country /
    // Same Continent tiers for GPS-off uploads instead of "Same Planet".
    return json.photos.map((p) => {
      const capture =
        typeof p.captureCountryCode === "string" &&
        p.captureCountryCode.trim().length === 2
          ? p.captureCountryCode.trim().toUpperCase()
          : null;
      const home =
        typeof p.countryCode === "string" &&
        p.countryCode.trim().length === 2
          ? p.countryCode.trim().toUpperCase()
          : null;
      const capturedAt =
        typeof p.capturedAt === "string" && p.capturedAt.length > 0
          ? p.capturedAt
          : null;
      return { ...p, captureCountryCode: capture ?? home, capturedAt };
    });
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
  echo: "pending" | "mutual" | "skipped";
  voterPhotoId?: string | null;
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
    const json = (await res.json().catch(() => ({}))) as {
      echo?: string;
      voterPhotoId?: string | null;
    };
    const echo =
      json.echo === "mutual" || json.echo === "pending" ? json.echo : "skipped";
    const resolvedVoterPhotoId =
      typeof json.voterPhotoId === "string" && json.voterPhotoId.length > 0
        ? json.voterPhotoId
        : null;
    return { ok: true, echo, voterPhotoId: resolvedVoterPhotoId };
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

/** Signed-in user's home country (ISO2) from the server profile row. */
export async function fetchMyCountryCode(): Promise<string | null> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/users/me`, {
      headers: await authedHeaders(),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { countryCode?: unknown };
    return typeof json.countryCode === "string" && json.countryCode.length === 2
      ? json.countryCode.toUpperCase()
      : null;
  } catch {
    return null;
  }
}

/** Persist home country after onboarding or profile edit. Best-effort. */
export async function updateMyCountryCode(countryCode: string): Promise<boolean> {
  const code = countryCode.trim().toUpperCase();
  if (code.length !== 2) return false;
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/users/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(await authedHeaders()),
      },
      body: JSON.stringify({ countryCode: code }),
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
  captureCountryCode: string | null;
  /** Real capture time (ISO) of this side's photo, or null when unknown. */
  capturedAt: string | null;
  /** Upload/share time (ISO) of this side's photo — temporal-tier fallback. */
  createdAt: string | null;
  country: string;
  countryFlag: string;
  theme?: string;
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
  youSentFirst?: boolean;
  mine: ServerEchoSide;
  theirs: ServerEchoSide;
}

// Map ISO-3166-1 alpha-2 → display name + flag emoji. Mirrors the same
// helpers used elsewhere on mobile so all surfaces show identical labels.
import { photoCountryDisplay } from "@/utils/photoCountry";

function decorateSide(side: {
  id: string;
  uri: string;
  countryCode: string | null;
  captureCountryCode?: string | null;
  capturedAt?: string | null;
  createdAt?: string | null;
  theme?: string;
  customAudioBase64?: string | null;
  customAudioMime?: string | null;
}): ServerEchoSide {
  // Geo-tier policy: prefer real capture-time GPS country, else fall back
  // to the uploader's declared home country so an echo from a GPS-off
  // photo still reaches the Same Country / Same Continent tiers instead of
  // collapsing to "Same Planet".
  const captureGps =
    typeof side.captureCountryCode === "string" &&
    side.captureCountryCode.trim().length === 2
      ? side.captureCountryCode.trim().toUpperCase()
      : null;
  const home =
    typeof side.countryCode === "string" &&
    side.countryCode.trim().length === 2
      ? side.countryCode.trim().toUpperCase()
      : null;
  const effectiveCapture = captureGps ?? home;
  const display = photoCountryDisplay(effectiveCapture);
  const audio =
    side.customAudioBase64 && side.customAudioMime
      ? `data:${side.customAudioMime};base64,${side.customAudioBase64}`
      : null;
  return {
    id: side.id,
    uri: side.uri,
    countryCode: display.code ?? null,
    captureCountryCode: effectiveCapture,
    capturedAt:
      typeof side.capturedAt === "string" && side.capturedAt.length > 0
        ? side.capturedAt
        : null,
    createdAt:
      typeof side.createdAt === "string" && side.createdAt.length > 0
        ? side.createdAt
        : null,
    country: display.name,
    countryFlag: display.flag,
    theme: typeof side.theme === "string" ? side.theme : undefined,
    customAudioUrl: audio,
  };
}

function decorateEcho(raw: {
  id: string;
  state: string;
  theme: string;
  createdAt: string;
  mutualAt: string | null;
  youSentFirst?: boolean;
  mine: {
    id: string;
    uri: string;
    countryCode: string | null;
    captureCountryCode?: string | null;
    capturedAt?: string | null;
    createdAt?: string | null;
    theme?: string;
    customAudioBase64?: string | null;
    customAudioMime?: string | null;
  };
  theirs: {
    id: string;
    uri: string;
    countryCode: string | null;
    captureCountryCode?: string | null;
    capturedAt?: string | null;
    createdAt?: string | null;
    theme?: string;
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
    youSentFirst: raw.youSentFirst,
    mine: decorateSide(raw.mine),
    theirs: decorateSide(raw.theirs),
  };
}

export type EchoListFetchResult = {
  ok: boolean;
  echoes: ServerEcho[];
};

export type JourneyFetchResult = {
  ok: boolean;
  matches: ServerJourneyMatch[];
};

/** Cloud backup of My Journey — ripples and passes for reinstall / new device. */
export async function fetchMyJourney(): Promise<JourneyFetchResult> {
  return fetchMyJourneyAtOrigin(getApiBase());
}

/** Journey fetch against an explicit API origin (hosted fallback in dev). */
export async function fetchMyJourneyAtOrigin(
  base: string,
): Promise<JourneyFetchResult> {
  try {
    const origin = base.replace(/\/$/, "");
    const res = await fetch(`${origin}/api/photos/my-journey`, {
      headers: await authedHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, matches: [] };
    const json = (await res.json()) as { matches?: unknown[] };
    const matches = Array.isArray(json.matches)
      ? (json.matches as ServerJourneyMatch[])
      : [];
    return { ok: true, matches };
  } catch {
    return { ok: false, matches: [] };
  }
}

export async function fetchEchoesInbox(): Promise<EchoListFetchResult> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/echoes/inbox`, {
      headers: await authedHeaders(),
    });
    if (!res.ok) return { ok: false, echoes: [] };
    const json = (await res.json()) as { echoes?: unknown[] };
    const echoes = Array.isArray(json.echoes)
      ? json.echoes.map((e) => decorateEcho(e as Parameters<typeof decorateEcho>[0]))
      : [];
    return { ok: true, echoes };
  } catch {
    return { ok: false, echoes: [] };
  }
}

export async function fetchEchoesMine(): Promise<EchoListFetchResult> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/echoes/mine`, {
      headers: await authedHeaders(),
    });
    if (!res.ok) return { ok: false, echoes: [] };
    const json = (await res.json()) as { echoes?: unknown[] };
    const echoes = Array.isArray(json.echoes)
      ? json.echoes.map((e) => decorateEcho(e as Parameters<typeof decorateEcho>[0]))
      : [];
    return { ok: true, echoes };
  } catch {
    return { ok: false, echoes: [] };
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
          captureCountryCode?: string | null;
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

export type RecentWaveFeedItem = {
  echoId: string;
  theme: string;
  mutualAt: string | null;
  a: ServerEchoSide;
  b: ServerEchoSide;
};

/** Recent mutual waves from other people (Waves tab browse feed). */
export async function fetchRecentWavesFeed(
  limit = 30,
): Promise<RecentWaveFeedItem[]> {
  try {
    const base = getApiBase();
    const res = await fetch(
      `${base}/api/echoes/recent-waves?limit=${encodeURIComponent(String(limit))}`,
      { headers: await authedHeaders() },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      waves?: Array<{
        echoId: string;
        theme: string;
        mutualAt: string | null;
        a: {
          id: string;
          countryCode: string | null;
          captureCountryCode?: string | null;
          capturedAt?: string | null;
          createdAt?: string | null;
        };
        b: {
          id: string;
          countryCode: string | null;
          captureCountryCode?: string | null;
          capturedAt?: string | null;
          createdAt?: string | null;
        };
      }>;
    };
    if (!Array.isArray(json.waves)) return [];
    return json.waves.map((w) => ({
      echoId: w.echoId,
      theme: w.theme,
      mutualAt: w.mutualAt,
      a: decorateSide({
        id: w.a.id,
        uri: `${base}/api/photos/${encodeURIComponent(w.a.id)}/image`,
        countryCode: w.a.countryCode,
        captureCountryCode: w.a.captureCountryCode,
        capturedAt: w.a.capturedAt,
        createdAt: w.a.createdAt,
      }),
      b: decorateSide({
        id: w.b.id,
        uri: `${base}/api/photos/${encodeURIComponent(w.b.id)}/image`,
        countryCode: w.b.countryCode,
        captureCountryCode: w.b.captureCountryCode,
        capturedAt: w.b.capturedAt,
        createdAt: w.b.createdAt,
      }),
    }));
  } catch {
    return [];
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
        captureCountryCode?: string | null;
        capturedAt?: string | null;
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
        captureCountryCode?: string | null;
        capturedAt?: string | null;
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

/**
 * Reuse an existing server photo for matching — updates metadata and
 * refreshes retention without inserting a duplicate row.
 */
export async function reactivateMyPhoto(
  photoId: string,
  input: {
    theme?: string;
    tags?: string[];
    musicGenre?: string;
    countryCode?: string;
  },
): Promise<UploadedPhoto | null> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/photos/${photoId}/reactivate`, {
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

/** Delete a photo you uploaded. Requires sign-in; only the owner can delete. */
export async function deleteMyPhoto(photoId: string): Promise<boolean> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/photos/${photoId}`, {
      method: "DELETE",
      headers: { ...(await authedHeaders()) },
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

/**
 * Atlas arc between two countries.
 * - `ripple` — one side tapped Same; waiting for the other to Ripple back.
 * - `wave` — both Rippled back (mutual Same).
 */
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
  /** Remote echo photo id (the spotlight side of the arc). */
  spotlightPhotoId?: string;
  /**
   * Content hash (md5 of the image bytes) of the spotlight photo. Stable across
   * the same image stored under several photo ids (seed dupes / re-uploads), so
   * Ripplefire tiles collapse identical photos even when their ids differ.
   */
  spotlightContentHash?: string;
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

/** In-memory cache so revisiting Atlas in one session is instant. */
const ATLAS_SUMMARY_CACHE_TTL_MS = 3 * 60 * 1000;
let atlasSummaryCache: { fetchedAt: number; data: AtlasSummaryResult } | null =
  null;

/** Drop cached `/api/photos/atlas` so the next fetch sees new ripples/waves. */
export function invalidateAtlasSummaryCache(): void {
  atlasSummaryCache = null;
}

/** Cheap liveness ping to wake hosted APIs (e.g. Render cold start) before Atlas opens. */
const HOSTED_API_WARM_TIMEOUT_MS = 12_000;
let hostedApiWarmStarted = false;

/** Lets Clerk boot "Try again" re-run API + Clerk warm-up. */
export function resetLaunchWarmups(): void {
  hostedApiWarmStarted = false;
  clerkWarmStarted = false;
}

function resolveHostedWarmOrigin(): string | null {
  if (__DEV__) {
    const staged = getStagedProductionApiOrigin();
    if (staged && !isLocalDevApiOrigin(staged)) return staged;
    const base = getPublicApiOrigin();
    if (!base.includes("__CONFIGURE") && !isLocalDevApiOrigin(base)) return base;
    return null;
  }
  const base = getPublicApiOrigin();
  if (base.includes("__CONFIGURE") || isLocalDevApiOrigin(base)) return null;
  return base;
}

/**
 * Fire-and-forget GET /api/healthz on app launch when using a hosted API.
 * Wakes Render without running the heavy `/api/photos/atlas` aggregate.
 */
export function warmHostedApiOnLaunch(): void {
  if (hostedApiWarmStarted) return;
  hostedApiWarmStarted = true;
  const origin = resolveHostedWarmOrigin();
  if (!origin) return;
  void (async () => {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), HOSTED_API_WARM_TIMEOUT_MS);
    try {
      await fetch(`${origin}/api/healthz`, {
        cache: "no-store",
        signal: ctrl.signal,
      });
    } catch {
      /* Atlas tab retries; warm-up is best-effort */
    } finally {
      clearTimeout(tid);
    }
  })();
}

let clerkWarmStarted = false;

/** Pre-warm Clerk Frontend API TLS while the splash is visible (best-effort). */
export function warmClerkOnLaunch(publishableKey: string): void {
  if (clerkWarmStarted || __DEV__) return;
  const key = publishableKey.trim();
  if (!key || (!key.startsWith("pk_test_") && !key.startsWith("pk_live_"))) {
    return;
  }
  clerkWarmStarted = true;
  void import("@/utils/clerkConfig")
    .then(({ probeClerkBootstrap }) =>
      probeClerkBootstrap(key, getPublicApiOrigin()),
    )
    .catch(() => {});
}

export type FetchAtlasSummaryOptions = {
  /** Bypass in-memory cache (pull-to-refresh, retry after timeout). */
  force?: boolean;
};

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
export async function fetchAtlasSummary(
  options?: FetchAtlasSummaryOptions,
): Promise<AtlasSummaryResult> {
  const force = options?.force === true;
  const now = Date.now();
  if (
    !force &&
    atlasSummaryCache &&
    now - atlasSummaryCache.fetchedAt < ATLAS_SUMMARY_CACHE_TTL_MS
  ) {
    const cached = atlasSummaryCache.data;
    if (!cached.loadError) return cached;
  }

  const bases = exploreApiBases();
  let lastResult: AtlasSummaryResult | null = null;

  for (let i = 0; i < bases.length; i++) {
    const base = bases[i]!;
    const apiHost = atlasApiHostForDisplay(base);
    const result = await Promise.race([
      fetchAtlasSummaryOnce(base, apiHost),
      new Promise<AtlasSummaryResult>((resolve) => {
        setTimeout(
          () => resolve(atlasTimeoutResult(apiHost)),
          ATLAS_FETCH_TIMEOUT_MS,
        );
      }),
    ]);
    if (
      !result.loadError &&
      (result.connections.length > 0 || result.countries.length > 0)
    ) {
      atlasSummaryCache = { fetchedAt: Date.now(), data: result };
      return result;
    }
    if (!result.loadError) {
      return result;
    }
    lastResult = result;
    if (result.loadError === "unauthorized") break;
    if (__DEV__ && i < bases.length - 1) {
      console.warn(
        `[fetchAtlasSummary] ${apiHost} failed — retrying ${bases[i + 1]}`,
      );
    }
  }

  return (
    lastResult ??
    atlasTimeoutResult(atlasApiHostForDisplay(bases[0] ?? getApiBase()))
  );
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
      meta?: { degraded?: boolean; reason?: string; hint?: string };
    };
    if (json.meta?.degraded === true) {
      const reason =
        typeof json.meta.reason === "string" && json.meta.reason.length > 0
          ? json.meta.reason
          : "database_unavailable";
      const hint =
        typeof json.meta.hint === "string" && json.meta.hint.length > 0
          ? json.meta.hint
          : undefined;
      return {
        countries: [],
        connections: [],
        loadError: "server",
        loadFailure: {
          category: "http",
          status: 200,
          detail: hint ? `${reason}: ${hint}` : reason,
          apiHost,
        },
      };
    }
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
        spotlightPhotoId:
          typeof c.spotlightPhotoId === "string" &&
          c.spotlightPhotoId.trim().length > 0
            ? c.spotlightPhotoId.trim()
            : undefined,
        spotlightContentHash:
          typeof c.spotlightContentHash === "string" &&
          c.spotlightContentHash.trim().length > 0
            ? c.spotlightContentHash.trim()
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

async function atlasDiagFetch(
  url: string,
  timeoutMs: number,
  headers?: Record<string, string>,
): Promise<{
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
    const res = await fetch(url, {
      signal: controller.signal,
      headers,
      cache: "no-store",
    });
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
export async function fetchAtlasTabDiagnostics(options?: {
  /** Merged connections currently shown on the globe (API + local). */
  globeConnections?: AtlasConnection[];
  viewerCountryCode?: string;
  localRippleMergeCount?: number;
}): Promise<{
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
    connectionCount?: number;
    rippleCount?: number;
    waveCount?: number;
  };
  ripplefire?: import("@/utils/atlasRipplefireDiagnostics").RipplefireDiagnosticsReport;
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
    await authedHeaders(),
  );

  let ripplefire:
    | import("@/utils/atlasRipplefireDiagnostics").RipplefireDiagnosticsReport
    | undefined;
  if (options?.globeConnections != null) {
    const { buildRipplefireDiagnosticsReport } = await import(
      "@/utils/atlasRipplefireDiagnostics"
    );
    ripplefire = buildRipplefireDiagnosticsReport(options.globeConnections, {
      viewerCountryCode: options.viewerCountryCode,
      localRippleMergeCount: options.localRippleMergeCount,
    });
  } else if (atlas.ok && atlas.text) {
    try {
      const json = JSON.parse(atlas.text) as { connections?: AtlasConnection[] };
      const connections = Array.isArray(json.connections) ? json.connections : [];
      const { buildRipplefireDiagnosticsReport } = await import(
        "@/utils/atlasRipplefireDiagnostics"
      );
      ripplefire = buildRipplefireDiagnosticsReport(connections, {
        viewerCountryCode: options?.viewerCountryCode,
      });
    } catch {
      /* ignore parse */
    }
  }

  let connectionCount: number | undefined;
  let rippleCount: number | undefined;
  let waveCount: number | undefined;
  if (atlas.ok && atlas.text) {
    try {
      const json = JSON.parse(atlas.text) as { connections?: AtlasConnection[] };
      const list = Array.isArray(json.connections) ? json.connections : [];
      connectionCount = list.length;
      rippleCount = list.filter((c) => c.kind === "ripple").length;
      waveCount = list.filter((c) => c.kind === "wave").length;
    } catch {
      /* ignore */
    }
  }

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
      connectionCount,
      rippleCount,
      waveCount,
    },
    ripplefire,
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

export type AtlasFireParticipant = {
  photoId: string;
  userId: string;
  countryCode: string;
  theme: string;
  tags: string[];
  subjects: string[];
  musicGenre: string | null;
  customAudioUrl: string | null;
  uri: string;
  /** md5 of the image bytes — stable identity for near-identical re-uploads. */
  contentHash?: string;
};

export type AtlasFireMoment = {
  id: string;
  kind: "ripple" | "wave";
  theme: string;
  tags: string[];
  subjects: string[];
  createdAt: string;
  from: string;
  to: string;
  participants: AtlasFireParticipant[];
};

/** Populated when explore returns no photos — shown in the UI for debugging. */
export type AtlasFireExploreDiagnostics = {
  summary: string;
  apiBase: string;
  cluster: {
    kind: string;
    displayTheme: string;
    countries: string[];
    connectionCount: number;
    allConnectionIds: string[];
    skippedLocalIds: string[];
    echoIdsSent: string[];
  };
  http: {
    endpoint: string;
    reached: boolean;
    ok: boolean | null;
    status: number | null;
    statusText: string | null;
    responseSnippet: string | null;
  };
  api: {
    momentsReturned: number;
    participantsTotal: number;
    participantsMissingUri: number;
    momentIds: string[];
  };
  fallback: {
    attempted: boolean;
    countryLoads: Array<{
      code: string;
      photosFetched: number;
      withUri: number;
      afterThemeFilter: number;
    }>;
    momentsFromFallback: number;
  };
  localDevice: {
    attempted: boolean;
    momentsFromMatches: number;
    matchIds: string[];
  };
  flatten: {
    tilesBuilt: number;
    droppedNoUri: number;
  };
  hints: string[];
};

export type AtlasFireExploreResult = {
  moments: AtlasFireMoment[];
  error: string | null;
  diagnostics: AtlasFireExploreDiagnostics;
};

function exploreDiagBase(
  cluster: AtlasFireExploreCluster | undefined,
  connectionIds: string[],
): AtlasFireExploreDiagnostics {
  const all = connectionIds.map((id) => id.trim()).filter(Boolean);
  const skippedLocal = all.filter((id) => id.startsWith("local-"));
  const echoIds = all.filter((id) => !id.startsWith("local-"));
  return {
    summary: "Loading…",
    apiBase: getApiBase(),
    cluster: {
      kind: cluster?.kind ?? "—",
      displayTheme: cluster?.displayTheme?.trim() ?? "—",
      countries: cluster?.countryCodes ?? [],
      connectionCount: all.length,
      allConnectionIds: all.slice(0, 12),
      skippedLocalIds: skippedLocal,
      echoIdsSent: echoIds.slice(0, 12),
    },
    http: {
      endpoint: "/api/photos/atlas/explore",
      reached: false,
      ok: null,
      status: null,
      statusText: null,
      responseSnippet: null,
    },
    api: {
      momentsReturned: 0,
      participantsTotal: 0,
      participantsMissingUri: 0,
      momentIds: [],
    },
    fallback: {
      attempted: false,
      countryLoads: [],
      momentsFromFallback: 0,
    },
    localDevice: {
      attempted: false,
      momentsFromMatches: 0,
      matchIds: [],
    },
    flatten: {
      tilesBuilt: 0,
      droppedNoUri: 0,
    },
    hints: [],
  };
}

/** Minimal match fields for on-device Ripplefire explore (avoids AppContext import cycle). */
export type LocalRippleExploreMatch = {
  id: string;
  verdict: "same" | "different" | null;
  myPhoto: string;
  theirPhoto: string;
  theirPhotoId?: string;
  myPhotoId?: string;
  theirCountryCode: string;
  myCountry?: string;
  myCountryCode?: string;
  myCaptureCountryCode?: string;
  theirCaptureCountryCode?: string;
  theme?: string;
  theirActualTheme?: string;
  theirTags?: string[];
  sharedTags?: string[];
  theirMusicGenre?: string;
  theirCustomAudioUrl?: string;
  myMusicGenre?: string;
  myCustomAudioUrl?: string;
  timestamp: string;
};

/** Mutual wave on device for Wavefire explore (`local-wave-{echoId}` arcs). */
export type LocalWaveExploreEcho = {
  id: string;
  theme: string;
  myPhoto: string;
  myPhotoId?: string;
  theirPhoto: string;
  theirPhotoId?: string;
  theirCountryCode: string;
  myCountryCode?: string;
  theirTags?: string[];
  myTags?: string[];
  theirMusicGenre?: string;
  theirCustomAudioUrl?: string;
  myMusicGenre?: string;
  myCustomAudioUrl?: string;
  mutualAt?: string | null;
};

/** Viewer uploads used to fill missing self-side tiles in explore. */
export type ViewerExplorePhoto = {
  uri: string;
  backendId?: string;
  theme?: string;
  tags?: string[];
  subjects?: string[];
  musicGenre?: string;
  customAudioUrl?: string;
  captureCountryCode?: string;
  uploadedAt?: string;
};

const LOCAL_MY_PHOTO_ID_PREFIX = "local-my-";

function viewerExploreParticipant(
  photo: ViewerExplorePhoto,
  countryCode: string,
  fallbackTheme: string,
): AtlasFireParticipant | null {
  const uri = photo.uri?.trim();
  if (!uri) return null;
  const theme =
    (photo.theme ?? fallbackTheme).trim() || fallbackTheme || "";
  return {
    photoId: photo.backendId?.trim() || `${LOCAL_MY_PHOTO_ID_PREFIX}viewer`,
    userId: "",
    countryCode,
    theme,
    tags: [...(photo.tags ?? [])].filter(Boolean),
    subjects: [...(photo.subjects ?? [])].filter(Boolean),
    musicGenre: photo.musicGenre ?? null,
    customAudioUrl: photo.customAudioUrl ?? null,
    uri,
  };
}

/** Ensure each cluster moment includes the viewer's photo when they're part of the pair. */
function enrichExploreWithViewerPhotos(
  moments: AtlasFireMoment[],
  viewerPhotos: ViewerExplorePhoto[],
  viewerCountryCode?: string,
): AtlasFireMoment[] {
  const primary = viewerPhotos[0];
  if (!primary?.uri?.trim()) return moments;

  const viewerDisplay = photoCountryDisplay(primary.captureCountryCode);
  const viewer = viewerDisplay.code ?? "";

  const primaryBackendId = primary.backendId?.trim();
  const viewerUriKeys = new Set(
    viewerPhotos
      .map((p) => photoKey(p.uri))
      .filter((k) => k.length > 0),
  );

  const isViewerParticipant = (p: AtlasFireParticipant) => {
    if (primaryBackendId && p.photoId === primaryBackendId) return true;
    if (p.photoId.startsWith(LOCAL_MY_PHOTO_ID_PREFIX)) return true;
    const uriKey = photoKey(p.uri);
    if (uriKey && viewerUriKeys.has(uriKey)) return true;
    return false;
  };

  return moments.map((m) => {
    const fallbackTheme =
      m.theme.trim() || primary.theme?.trim() || "";

    let participants = m.participants.map((p) => {
      if (!isViewerParticipant(p) || p.uri?.trim()) return p;
      const patched = viewerExploreParticipant(
        primary,
        p.countryCode || viewer || "",
        fallbackTheme,
      );
      return patched ?? p;
    });

    return { ...m, participants };
  });
}

/** Build explore moments from `local-ripple-{matchId}` arcs (no API). */
export function buildLocalMatchExploreMoments(
  connectionIds: string[],
  matches: LocalRippleExploreMatch[],
  cluster: AtlasFireExploreCluster,
  viewerCountryCode?: string,
): AtlasFireMoment[] {
  const matchIds = new Set<string>();
  for (const id of connectionIds) {
    if (id.startsWith("local-ripple-")) {
      matchIds.add(id.slice("local-ripple-".length));
    }
  }
  if (matchIds.size === 0 || matches.length === 0) return [];

  const countrySet = new Set(
    cluster.countryCodes.map((c) => c.trim().toUpperCase()).filter(Boolean),
  );
  const viewer = (viewerCountryCode ?? "").trim().toUpperCase();
  const moments: AtlasFireMoment[] = [];

  for (const m of matches) {
    if (!matchIds.has(m.id) || m.verdict !== "same") continue;
    const their = resolveTheirAtlasIso2(m);
    if (
      countrySet.size > 0 &&
      their !== ATLAS_SOMEWHERE_ISO &&
      !countrySet.has(their)
    ) {
      continue;
    }
    const stash = resolveMatchPhotoUris(m.id, {
      myPhoto: m.myPhoto ?? "",
      theirPhoto: m.theirPhoto ?? "",
    });
    const theirUri = stash.theirPhoto?.trim();
    const myUri = stash.myPhoto?.trim();

    const theme =
      (m.theme ?? m.theirActualTheme ?? cluster.displayTheme ?? "").trim() ||
      cluster.displayTheme ||
      "";
    const tags = [...(m.theirTags ?? []), ...(m.sharedTags ?? [])].filter(Boolean);
    const myFromPhoto = photoCountryDisplay(m.myCaptureCountryCode);
    const from =
      myFromPhoto.code ??
      (their && /^[A-Z]{2}$/.test(their) ? their : "");

    const participants: AtlasFireParticipant[] = [];
    if (myUri) {
      participants.push({
        photoId: m.myPhotoId?.trim() || `${LOCAL_MY_PHOTO_ID_PREFIX}${m.id}`,
        userId: "",
        countryCode: from,
        theme: (m.theme ?? theme).trim() || theme,
        tags: [...(m.sharedTags ?? [])].filter(Boolean),
        subjects: [],
        musicGenre: m.myMusicGenre ?? null,
        customAudioUrl: m.myCustomAudioUrl ?? null,
        uri: myUri,
      });
    }
    if (theirUri) {
      participants.push({
        photoId: m.theirPhotoId?.trim() || m.id,
        userId: "",
        countryCode: their,
        theme,
        tags,
        subjects: [],
        musicGenre: m.theirMusicGenre ?? null,
        customAudioUrl: m.theirCustomAudioUrl ?? null,
        uri: theirUri,
      });
    }
    if (participants.length === 0) continue;

    moments.push({
      id: `local-match-${m.id}`,
      kind: cluster.kind,
      theme,
      tags,
      subjects: [],
      createdAt: m.timestamp || new Date().toISOString(),
      from,
      to: their || from,
      participants,
    });
  }
  return moments;
}

/** Build explore moments from `local-wave-{echoId}` arcs (no API). */
export function buildLocalWaveExploreMoments(
  connectionIds: string[],
  echoes: LocalWaveExploreEcho[],
  cluster: AtlasFireExploreCluster,
  viewerCountryCode?: string,
): AtlasFireMoment[] {
  const echoIds = new Set<string>();
  for (const id of connectionIds) {
    if (id.startsWith("local-wave-")) {
      echoIds.add(id.slice("local-wave-".length));
    }
  }
  if (echoIds.size === 0 || echoes.length === 0) return [];

  const countrySet = new Set(
    cluster.countryCodes.map((c) => c.trim().toUpperCase()).filter(Boolean),
  );
  const viewer = (viewerCountryCode ?? "").trim().toUpperCase();
  const moments: AtlasFireMoment[] = [];

  for (const e of echoes) {
    if (!echoIds.has(e.id)) continue;
    const their = (e.theirCountryCode ?? "").trim().toUpperCase();
    if (countrySet.size > 0 && their && !countrySet.has(their)) continue;
    const theirUri = e.theirPhoto?.trim();
    const myUri = e.myPhoto?.trim();

    const theme = (e.theme ?? cluster.displayTheme ?? "").trim() || cluster.displayTheme || "";
    const tags = [...(e.myTags ?? []), ...(e.theirTags ?? [])].filter(Boolean);
    const from =
      viewer && /^[A-Z]{2}$/.test(viewer)
        ? viewer
        : (e.myCountryCode ?? "").trim().toUpperCase() || their;

    const participants: AtlasFireParticipant[] = [];
    if (myUri) {
      participants.push({
        photoId: e.myPhotoId?.trim() || `${LOCAL_MY_PHOTO_ID_PREFIX}wave-${e.id}`,
        userId: "",
        countryCode: from,
        theme,
        tags: [...(e.myTags ?? [])].filter(Boolean),
        subjects: [],
        musicGenre: e.myMusicGenre ?? null,
        customAudioUrl: e.myCustomAudioUrl ?? null,
        uri: myUri,
      });
    }
    if (theirUri) {
      participants.push({
        photoId: e.theirPhotoId?.trim() || e.id,
        userId: "",
        countryCode: their,
        theme,
        tags: [...(e.theirTags ?? [])].filter(Boolean),
        subjects: [],
        musicGenre: e.theirMusicGenre ?? null,
        customAudioUrl: e.theirCustomAudioUrl ?? null,
        uri: theirUri,
      });
    }
    if (participants.length === 0) continue;

    moments.push({
      id: `local-wave-${e.id}`,
      kind: "wave",
      theme,
      tags,
      subjects: [],
      createdAt: e.mutualAt ?? new Date().toISOString(),
      from,
      to: their || from,
      participants,
    });
  }
  return moments;
}

function countMomentParticipants(moments: AtlasFireMoment[]): {
  total: number;
  missingUri: number;
} {
  let total = 0;
  let missingUri = 0;
  for (const m of moments) {
    for (const p of m.participants) {
      total += 1;
      if (!p.uri?.trim()) missingUri += 1;
    }
  }
  return { total, missingUri };
}

function finalizeExploreDiagnostics(
  diag: AtlasFireExploreDiagnostics,
  moments: AtlasFireMoment[],
  tilesBuilt: number,
): AtlasFireExploreDiagnostics {
  const { total, missingUri } = countMomentParticipants(moments);
  diag.api.momentsReturned = moments.length;
  diag.api.participantsTotal = total;
  diag.api.participantsMissingUri = missingUri;
  diag.api.momentIds = moments.map((m) => m.id).slice(0, 12);
  diag.flatten.tilesBuilt = tilesBuilt;
  diag.flatten.droppedNoUri = Math.max(0, total - tilesBuilt);

  if (tilesBuilt > 0) {
    diag.summary = `OK — ${tilesBuilt} photo(s) ready`;
    return diag;
  }

  if (!diag.http.reached) {
    diag.summary = "Network error — could not reach API";
    if (isLocalDevApiOrigin(diag.apiBase)) {
      if (
        !diag.hints.some((h) =>
          h.includes("EXPO_PUBLIC_DEV_API_URL"),
        )
      ) {
        diag.hints.push(
          "Check EXPO_PUBLIC_DEV_API_URL matches your PC LAN IP :8787 (same Wi‑Fi, Windows firewall allows port 8787)",
        );
      }
    }
  } else if (diag.http.status === 404) {
    diag.summary = "API missing explore route (404)";
    diag.hints.push("Deploy/restart api-server with POST /api/photos/atlas/explore");
  } else if (!diag.http.ok) {
    diag.summary = `API error HTTP ${diag.http.status ?? "?"}`;
  } else if (diag.api.momentsReturned === 0 && !diag.fallback.attempted) {
    diag.summary = "API returned 0 moments (no echo rows matched)";
    diag.hints.push(
      "Echo ids in cluster may not exist in DB — re-seed or refresh Atlas",
    );
  } else if (diag.api.momentsReturned === 0 && diag.fallback.momentsFromFallback === 0) {
    diag.summary = "Explore + country fallback both returned 0 photos";
    diag.hints.push(
      "Run seed:atlas-global on api-server or add photos in cluster countries",
    );
  } else if (missingUri > 0 && tilesBuilt === 0) {
    diag.summary = `${moments.length} moment(s) but all photos missing image bytes`;
    diag.hints.push("Photos exist in DB but bytes_base64 is empty on server");
  } else {
    diag.summary = "No displayable photos for this cluster";
  }

  if (
    diag.cluster.skippedLocalIds.length > 0 &&
    diag.localDevice.momentsFromMatches === 0
  ) {
    diag.hints.push(
      `${diag.cluster.skippedLocalIds.length} local-only arc(s) skipped (not on server)`,
    );
  }
  if (diag.localDevice.momentsFromMatches > 0) {
    diag.hints.push(
      `${diag.localDevice.momentsFromMatches} photo(s) from ripples on this device`,
    );
  }
  if (diag.cluster.echoIdsSent.length === 0 && diag.cluster.countries.length === 0) {
    diag.hints.push("Cluster has no echo ids and no countries to fall back on");
  }
  if (tilesBuilt === 0 && !isLocalDevApiOrigin(diag.apiBase)) {
    diag.hints.push(
      `App is calling ${diag.apiBase} (not local :8787) — deploy api-server or set EXPO_PUBLIC_DEV_API_URL`,
    );
  }

  return diag;
}

/** Multi-line report for the explore empty state. */
export function formatAtlasFireExploreDiagnostics(
  d: AtlasFireExploreDiagnostics,
): string {
  const lines: string[] = [
    `Summary: ${d.summary}`,
    "",
    `API: ${d.apiBase}`,
    `POST ${d.http.endpoint}`,
    `HTTP: ${d.http.reached ? (d.http.ok ? `OK ${d.http.status}` : `FAIL ${d.http.status} ${d.http.statusText ?? ""}`.trim()) : "not reached"}`,
  ];
  if (d.http.responseSnippet) {
    lines.push(`Body: ${d.http.responseSnippet}`);
  }
  lines.push(
    "",
    `Cluster (${d.cluster.kind}): "${d.cluster.displayTheme}"`,
    `Countries: ${d.cluster.countries.join(", ") || "—"}`,
    `Connections: ${d.cluster.connectionCount}`,
    `Echo ids sent: ${d.cluster.echoIdsSent.join(", ") || "—"}`,
  );
  if (d.cluster.skippedLocalIds.length > 0) {
    lines.push(`Skipped local ids: ${d.cluster.skippedLocalIds.join(", ")}`);
  }
  lines.push(
    "",
    `API moments: ${d.api.momentsReturned} (participants ${d.api.participantsTotal}, missing uri ${d.api.participantsMissingUri})`,
  );
  if (d.localDevice.attempted) {
    lines.push(
      "",
      `On-device ripples: ${d.localDevice.momentsFromMatches} photo(s)`,
      d.localDevice.matchIds.length > 0
        ? `Match ids: ${d.localDevice.matchIds.join(", ")}`
        : "",
    );
  }
  if (d.fallback.attempted) {
    lines.push(
      "",
      "Country fallback:",
      ...d.fallback.countryLoads.map(
        (c) =>
          `  ${c.code}: fetched ${c.photosFetched}, with uri ${c.withUri}, after theme ${c.afterThemeFilter}`,
      ),
      `Fallback moments: ${d.fallback.momentsFromFallback}`,
    );
  }
  lines.push("", `Tiles built: ${d.flatten.tilesBuilt}`);
  if (d.hints.length > 0) {
    lines.push("", "Likely fix:", ...d.hints.map((h) => `• ${h}`));
  }
  return lines.join("\n");
}

export type AtlasFireExploreCluster = {
  kind: "ripple" | "wave";
  countryCodes: string[];
  displayTheme?: string;
};

async function exploreFallbackFromCountries(
  cluster: AtlasFireExploreCluster,
  diag: AtlasFireExploreDiagnostics,
): Promise<AtlasFireMoment[]> {
  diag.fallback.attempted = true;
  const themeHint = (cluster.displayTheme ?? "").trim();
  const moments: AtlasFireMoment[] = [];
  for (const code of cluster.countryCodes) {
    if (code === ATLAS_SOMEWHERE_ISO) continue;
    const photos = await fetchAtlasCountryPhotos(code);
    let withUri = 0;
    let afterTheme = 0;
    for (const p of photos) {
      if (!p.uri) continue;
      withUri += 1;
      if (
        themeHint.length >= 2 &&
        !isThemeOnTopic(themeHint, p.theme) &&
        !(p.tags ?? []).some((t) => isThemeOnTopic(themeHint, t))
      ) {
        continue;
      }
      afterTheme += 1;
      moments.push({
        id: `country-${code}-${p.id}`,
        kind: cluster.kind,
        theme: p.theme || cluster.displayTheme || "",
        tags: p.tags ?? [],
        subjects: [],
        createdAt: p.createdAt ?? new Date().toISOString(),
        from: code,
        to: code,
        participants: [
          {
            photoId: p.id,
            userId: "",
            countryCode: code,
            theme: p.theme,
            tags: p.tags ?? [],
            subjects: [],
            musicGenre: p.musicGenre,
            customAudioUrl: p.customAudioUrl,
            uri: p.uri,
          },
        ],
      });
    }
    diag.fallback.countryLoads.push({
      code,
      photosFetched: photos.length,
      withUri,
      afterThemeFilter: afterTheme,
    });
  }
  diag.fallback.momentsFromFallback = moments.length;
  return moments;
}

function exploreApiBases(): string[] {
  const primary = getApiBase();
  const bases = [primary];
  if (__DEV__ && isLocalDevApiOrigin(primary)) {
    const remote = getStagedProductionApiOrigin();
    if (remote && remote !== primary) bases.push(remote);
  }
  return bases;
}

async function postAtlasFireExplore(
  base: string,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<{
  reached: boolean;
  ok: boolean;
  status: number;
  statusText: string;
  rawText: string;
}> {
  const res = await fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: {
      ...(await authedHeaders()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const rawText = await res.text();
  return {
    reached: true,
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    rawText,
  };
}

export type AtlasFireExploreOptions = {
  localMatches?: LocalRippleExploreMatch[];
  localWaves?: LocalWaveExploreEcho[];
  viewerCountryCode?: string;
  /** Your posted photos — used when server/local moments omit your side of a pair. */
  viewerMyPhotos?: ViewerExplorePhoto[];
};

/** Include device ripples that match the cluster theme even if not yet on the server map. */
export function expandExploreConnectionIds(
  connectionIds: string[],
  cluster: AtlasFireExploreCluster | undefined,
  localMatches?: LocalRippleExploreMatch[],
): string[] {
  const out = new Set(
    connectionIds.map((id) => id.trim()).filter((id) => id.length > 0),
  );
  if (!cluster || !localMatches?.length) return [...out];

  const displayTheme = cluster.displayTheme?.trim() ?? "";
  for (const m of localMatches) {
    if (m.verdict !== "same") continue;
    const localId = `local-ripple-${m.id}`;
    if (out.has(localId)) continue;
    const matchTheme = (m.theme ?? m.theirActualTheme ?? "").trim();
    if (displayTheme && matchTheme && !clusterThemesAlign(displayTheme, matchTheme)) {
      continue;
    }
    out.add(localId);
  }
  return [...out];
}

/** Load photos + vibes for Wavefire / Ripplefire cluster echo ids. */
export async function fetchAtlasFireExplore(
  connectionIds: string[],
  cluster?: AtlasFireExploreCluster,
  options?: AtlasFireExploreOptions,
): Promise<AtlasFireExploreResult> {
  const expandedConnectionIds = expandExploreConnectionIds(
    connectionIds,
    cluster,
    options?.localMatches,
  );
  const diag = exploreDiagBase(cluster, expandedConnectionIds);
  const ids = [
    ...new Set(
      expandedConnectionIds
        .map((id) => id.trim())
        .filter((id) => id.length > 0 && !id.startsWith("local-")),
    ),
  ].slice(0, 40);
  diag.cluster.echoIdsSent = ids.slice(0, 12);

  const hasCluster =
    cluster != null &&
    cluster.countryCodes.length > 0 &&
    (cluster.kind === "ripple" || cluster.kind === "wave");

  const finish = (moments: AtlasFireMoment[], error: string | null) => {
    const merged = mergeExploreWithLocalMoments(
      moments,
      expandedConnectionIds,
      collectLocalDeviceMoments,
    );
    const withViewer = enrichExploreWithViewerPhotos(
      merged,
      options?.viewerMyPhotos ?? [],
      options?.viewerCountryCode,
    );
    const capped = capExploreMomentsForFlatten(
      withViewer,
      buildExploreFlattenOptions(options?.viewerMyPhotos),
    );
    const tiles = flattenAtlasFireExplorePhotos(
      capped,
      cluster?.displayTheme ?? "",
      undefined,
      buildExploreFlattenOptions(options?.viewerMyPhotos),
    );
    finalizeExploreDiagnostics(diag, withViewer, tiles.length);
    return { moments: capped, error, diagnostics: diag };
  };

  const collectLocalDeviceMoments = (): AtlasFireMoment[] => {
    if (!cluster) return [];
    const ripple = options?.localMatches?.length
      ? buildLocalMatchExploreMoments(
          expandedConnectionIds,
          options.localMatches,
          cluster,
          options.viewerCountryCode,
        )
      : [];
    const wave = options?.localWaves?.length
      ? buildLocalWaveExploreMoments(
          expandedConnectionIds,
          options.localWaves,
          cluster,
          options.viewerCountryCode,
        )
      : [];
    return [...ripple, ...wave];
  };

  const tryLocalDeviceMoments = (): AtlasFireMoment[] | null => {
    const hasLocal =
      (options?.localMatches?.length ?? 0) > 0 ||
      (options?.localWaves?.length ?? 0) > 0;
    if (!hasLocal || !cluster) return null;
    diag.localDevice.attempted = true;
    const local = collectLocalDeviceMoments();
    diag.localDevice.momentsFromMatches = local.length;
    diag.localDevice.matchIds = local
      .map((m) => m.id.replace(/^local-(match|wave)-/, ""))
      .slice(0, 12);
    return local.length > 0 ? local : null;
  };

  // Cluster is only local arcs — show on-device photos without waiting on LAN API.
  if (
    ids.length === 0 &&
    diag.cluster.skippedLocalIds.length > 0 &&
    ((options?.localMatches?.length ?? 0) > 0 ||
      (options?.localWaves?.length ?? 0) > 0)
  ) {
    const localOnly = tryLocalDeviceMoments();
    if (localOnly) {
      const label =
        cluster?.kind === "wave" ? "your waves" : "your ripples";
      diag.summary = `OK — ${localOnly.length} photo(s) from ${label}`;
      return finish(localOnly, null);
    }
  }

  if (ids.length === 0 && !hasCluster) {
    const local = tryLocalDeviceMoments();
    if (local) return finish(local, null);
    diag.summary = "Cluster has no server echo ids and no country fallback";
    diag.hints.push("Wait for Atlas arcs to load or switch Atlas filter to All");
    return finish([], "Nothing to load for this cluster.");
  }

  const exploreTheme = (() => {
    const raw = (cluster?.displayTheme ?? "").trim();
    if (!raw) return undefined;
    return resolveChallengeThemeId(raw) || raw;
  })();

  const exploreBody = {
    ids,
    kind: cluster?.kind,
    countryCodes: cluster?.countryCodes?.filter((c) => c !== ATLAS_SOMEWHERE_ISO),
    theme: exploreTheme,
  };

  const bases = exploreApiBases();
  let lastNetworkError: string | null = null;

  for (let bi = 0; bi < bases.length; bi++) {
    const base = bases[bi]!;
    diag.apiBase = base;
    if (bi > 0) {
      diag.hints.push(`Retried explore on ${base}`);
    }

    if (ids.length === 0 && !hasCluster) {
      break;
    }

    try {
      const result = await postAtlasFireExplore(
        base,
        diag.http.endpoint,
        exploreBody,
      );
      diag.http.reached = result.reached;
      diag.http.ok = result.ok;
      diag.http.status = result.status;
      diag.http.statusText = result.statusText;
      const rawText = result.rawText;

      if (!result.ok) {
        diag.http.responseSnippet = rawText.slice(0, 280);
        if (bi < bases.length - 1) continue;
        if (hasCluster && cluster) {
          const fallback = await exploreFallbackFromCountries(cluster, diag);
          if (fallback.length > 0) return finish(fallback, null);
        }
        const local = tryLocalDeviceMoments();
        if (local) return finish(local, null);
        return finish(
          [],
          result.status === 404
            ? "Explore is not available on this server yet."
            : `Could not load cluster photos (HTTP ${result.status}).`,
        );
      }

      let json: { moments?: AtlasFireMoment[] } = {};
      try {
        json = JSON.parse(rawText) as { moments?: AtlasFireMoment[] };
      } catch {
        diag.http.responseSnippet = rawText.slice(0, 280);
        diag.hints.push("API returned non-JSON — check api-server logs");
      }
      let moments = Array.isArray(json.moments) ? json.moments : [];
      if (moments.length === 0 && hasCluster && cluster) {
        moments = await exploreFallbackFromCountries(cluster, diag);
      }
      if (moments.length === 0) {
        const local = tryLocalDeviceMoments();
        if (local) return finish(local, null);
      }
      return finish(moments, null);
    } catch (err) {
      diag.http.reached = false;
      diag.http.ok = null;
      diag.http.status = null;
      lastNetworkError =
        err instanceof Error ? err.message.slice(0, 280) : String(err).slice(0, 280);
      diag.http.responseSnippet = lastNetworkError;
      if (bi < bases.length - 1) continue;
    }
  }

  if (hasCluster && cluster) {
    const fallback = await exploreFallbackFromCountries(cluster, diag);
    if (fallback.length > 0) return finish(fallback, null);
  }

  const local = tryLocalDeviceMoments();
  if (local) return finish(local, null);

  return finish([], "Network error loading cluster photos.");
}

/** Keep explore scroll order aligned with cluster arcs (incl. `local-ripple-*`). */
export function orderExploreMomentsByConnections(
  moments: AtlasFireMoment[],
  connectionIds: string[],
): AtlasFireMoment[] {
  if (moments.length <= 1 || connectionIds.length === 0) return moments;

  const findForConnection = (connId: string): AtlasFireMoment | undefined => {
    if (connId.startsWith("local-ripple-")) {
      const matchId = connId.slice("local-ripple-".length);
      return moments.find((m) => m.id === `local-match-${matchId}`);
    }
    if (connId.startsWith("local-wave-")) {
      const echoId = connId.slice("local-wave-".length);
      return moments.find((m) => m.id === `local-wave-${echoId}`);
    }
    return moments.find((m) => m.id === connId);
  };

  const ordered: AtlasFireMoment[] = [];
  const used = new Set<string>();
  for (const connId of connectionIds) {
    const m = findForConnection(connId);
    if (m && !used.has(m.id)) {
      ordered.push(m);
      used.add(m.id);
    }
  }
  for (const m of moments) {
    if (!used.has(m.id)) ordered.push(m);
  }
  return ordered;
}

function mergeExploreWithLocalMoments(
  serverMoments: AtlasFireMoment[],
  connectionIds: string[],
  collectLocal: () => AtlasFireMoment[],
): AtlasFireMoment[] {
  const local = collectLocal();
  const seen = new Set(serverMoments.map((m) => m.id));
  const merged = [...serverMoments];
  for (const lm of local) {
    if (!seen.has(lm.id)) {
      merged.push(lm);
      seen.add(lm.id);
    }
  }
  return orderExploreMomentsByConnections(merged, connectionIds);
}

const EXPLORE_INLINE_DATA_URI_MAX = 480_000;

/** Pick a URI the explore pager can decode (stream API image when data: is huge). */
export function resolveExplorePhotoDisplayUri(
  participant: AtlasFireParticipant,
  apiBase: string,
  momentId?: string,
): string {
  const base = apiBase.replace(/\/$/, "");
  const localMatchId =
    momentId?.startsWith("local-match-") === true
      ? momentId.slice("local-match-".length)
      : undefined;
  if (localMatchId) {
    const stash = resolveMatchPhotoUris(localMatchId, {
      myPhoto: "",
      theirPhoto: "",
    });
    const pid = participant.photoId?.trim() ?? "";
    if (pid.startsWith(LOCAL_MY_PHOTO_ID_PREFIX)) {
      const mine = stash.myPhoto?.trim();
      if (mine) return mine;
    }
    const theirs = stash.theirPhoto?.trim();
    if (theirs) return theirs;
    const fallback = participant.uri?.trim();
    if (fallback) return fallback;
  }

  const raw = participant.uri?.trim() ?? "";
  if (raw.startsWith("file:")) return raw;

  const photoId = participant.photoId?.trim() ?? "";
  const serverImage =
    photoId &&
    !photoId.startsWith("local-") &&
    !photoId.startsWith(LOCAL_MY_PHOTO_ID_PREFIX)
      ? serverPhotoImageUrlAtOrigin(photoId, base)
      : "";

  // Prefer authenticated stream URLs — faster decode and stable dedup keys.
  if (serverImage) return serverImage;

  if (raw.startsWith("data:")) {
    if (raw.length <= EXPLORE_INLINE_DATA_URI_MAX) return raw;
    return serverImage || raw;
  }

  if (raw.startsWith("/api/photos/") && raw.endsWith("/image")) {
    return withDisplayPhotoWidth(`${base}${raw}`);
  }

  return withDisplayPhotoWidth(raw);
}

export function explorePhotoUriNeedsAuth(uri: string): boolean {
  return /\/api\/photos\/[^/]+\/image(?:\?|$)/.test(uri);
}

export type FlattenExploreOptions = {
  viewerBackendPhotoIds?: ReadonlySet<string>;
  viewerUriKeys?: ReadonlySet<string>;
};

/** Viewer identity for explore flatten — one tile per distinct image, counterparty first. */
export function buildExploreFlattenOptions(
  viewerMyPhotos?: ViewerExplorePhoto[],
): FlattenExploreOptions {
  const viewerBackendPhotoIds = new Set<string>();
  const viewerUriKeys = new Set<string>();
  for (const p of viewerMyPhotos ?? []) {
    const bid = p.backendId?.trim();
    if (bid) viewerBackendPhotoIds.add(bid);
    const key = photoKey(p.uri);
    if (key) viewerUriKeys.add(key);
  }
  return {
    viewerBackendPhotoIds:
      viewerBackendPhotoIds.size > 0 ? viewerBackendPhotoIds : undefined,
    viewerUriKeys: viewerUriKeys.size > 0 ? viewerUriKeys : undefined,
  };
}

function isExploreViewerParticipant(
  p: AtlasFireParticipant,
  displayUri: string,
  opts?: FlattenExploreOptions,
): boolean {
  if (!opts) return false;
  const pid = p.photoId?.trim() ?? "";
  if (pid.startsWith(LOCAL_MY_PHOTO_ID_PREFIX)) return true;
  if (pid && opts.viewerBackendPhotoIds?.has(pid)) return true;
  const uriKey = photoKey(displayUri);
  if (uriKey && opts.viewerUriKeys?.has(uriKey)) return true;
  return false;
}

/** Stable tile identity — photoId when known, else uri hash (handles data vs stream). */
export function explorePhotoTileIdentity(
  p: AtlasFireParticipant,
  displayUri: string,
): string {
  const pid = p.photoId?.trim() ?? "";
  if (pid.startsWith(LOCAL_MY_PHOTO_ID_PREFIX)) {
    const uriKey = photoKey(displayUri);
    return uriKey ? `viewer:${uriKey}` : `viewer:${pid}`;
  }
  // Prefer content hash so the same image under several photo ids (seed dupes /
  // re-uploads) collapses to one tile, matching the server's content_hash dedup.
  const hash = p.contentHash?.trim();
  if (hash) return `hash:${hash}`;
  if (pid && !pid.startsWith("local-")) return `photo:${pid}`;
  const uriKey = photoKey(displayUri);
  return uriKey ? `uri:${uriKey}` : "";
}

/** Limit counterparty photo repeats after local + server merge (mirrors server cap). */
export function capExploreMomentsForFlatten(
  moments: AtlasFireMoment[],
  flattenOptions?: FlattenExploreOptions,
  maxPerPhoto = 1,
): AtlasFireMoment[] {
  const exemptPhotoIds = flattenOptions?.viewerBackendPhotoIds;
  const counts = new Map<string, number>();
  const out: AtlasFireMoment[] = [];
  for (const moment of moments) {
    // Cap on content hash when present so re-uploads / seed dupes of one image
    // (distinct photo ids, same bytes) collapse to a single explore moment.
    const cappedKeys: string[] = [];
    for (const p of moment.participants) {
      const id = p.photoId?.trim();
      if (!id) continue;
      if (id.startsWith(LOCAL_MY_PHOTO_ID_PREFIX)) continue;
      if (exemptPhotoIds?.has(id)) continue;
      const hash = p.contentHash?.trim();
      cappedKeys.push(hash ? `hash:${hash}` : `id:${id}`);
    }
    let blocked = false;
    for (const key of cappedKeys) {
      const next = (counts.get(key) ?? 0) + 1;
      if (next > maxPerPhoto) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    for (const key of cappedKeys) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    out.push(moment);
  }
  return out;
}

/** Flatten explore moments into scrollable photo rows (one counterparty photo per arc). */
export function flattenAtlasFireExplorePhotos(
  moments: AtlasFireMoment[],
  fallbackTheme: string,
  apiBase?: string,
  flattenOptions?: FlattenExploreOptions,
): Array<{ key: string; theme: string; participant: AtlasFireParticipant }> {
  const base = apiBase?.trim() || getApiBase();
  const out: Array<{
    key: string;
    theme: string;
    participant: AtlasFireParticipant;
  }> = [];
  const seenTileIds = new Set<string>();
  const counterpartyTiles: Array<{
    key: string;
    theme: string;
    participant: AtlasFireParticipant;
    tileId: string;
  }> = [];
  let viewerTile: {
    key: string;
    theme: string;
    participant: AtlasFireParticipant;
    tileId: string;
  } | null = null;

  const clusterTheme = fallbackTheme.trim();

  const pushTile = (
    m: AtlasFireMoment,
    p: AtlasFireParticipant,
    displayUri: string,
  ) => {
    const tileId = explorePhotoTileIdentity(p, displayUri);
    if (!tileId) return null;
    const theme = m.theme.trim() || p.theme.trim() || fallbackTheme;
    const isPairedRippleMoment =
      m.id.startsWith("local-match-") || m.id.startsWith("local-wave-");
    if (
      clusterTheme &&
      !isPairedRippleMoment &&
      !clusterThemesAlign(clusterTheme, theme)
    ) {
      return null;
    }
    return {
      key: `${m.id}:${tileId}`,
      theme,
      participant: { ...p, uri: displayUri },
      tileId,
    };
  };

  for (const m of moments) {
    const resolved = m.participants
      .map((p) => {
        const displayUri = resolveExplorePhotoDisplayUri(p, base, m.id);
        if (!displayUri) return null;
        return {
          participant: p,
          displayUri,
          isViewer: isExploreViewerParticipant(p, displayUri, flattenOptions),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    const viewerInMoment = resolved.some((r) => r.isViewer);
    const tilesForMoment = viewerInMoment
      ? resolved.filter((r) => !r.isViewer).slice(0, 1)
      : resolved;

    for (const r of tilesForMoment) {
      const tile = pushTile(m, r.participant, r.displayUri);
      if (tile && !seenTileIds.has(tile.tileId)) {
        seenTileIds.add(tile.tileId);
        counterpartyTiles.push(tile);
      }
    }

    if (!viewerTile) {
      const viewerResolved = resolved.find((r) => r.isViewer);
      if (viewerResolved) {
        const tile = pushTile(
          m,
          viewerResolved.participant,
          viewerResolved.displayUri,
        );
        if (tile) viewerTile = tile;
      }
    }
  }

  if (viewerTile && counterpartyTiles.length > 0) {
    if (!seenTileIds.has(viewerTile.tileId)) {
      out.push({
        key: viewerTile.key,
        theme: viewerTile.theme,
        participant: viewerTile.participant,
      });
      seenTileIds.add(viewerTile.tileId);
    }
  }

  for (const tile of counterpartyTiles) {
    out.push({
      key: tile.key,
      theme: tile.theme,
      participant: tile.participant,
    });
  }

  if (out.length === 0 && viewerTile) {
    out.push({
      key: viewerTile.key,
      theme: viewerTile.theme,
      participant: viewerTile.participant,
    });
  }

  return out;
}

/** Returns up to 30 recent photos for a given country code. */
const atlasCountryPhotosCache = new Map<
  string,
  { fetchedAt: number; photos: AtlasPhoto[] }
>();
const ATLAS_COUNTRY_PHOTOS_TTL_MS = 3 * 60 * 1000;

export async function fetchAtlasCountryPhotos(
  countryCode: string,
): Promise<AtlasPhoto[]> {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return [];

  const cached = atlasCountryPhotosCache.get(code);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < ATLAS_COUNTRY_PHOTOS_TTL_MS) {
    return cached.photos;
  }

  try {
    const base = getApiBase();
    const res = await fetch(
      `${base}/api/photos/atlas/${encodeURIComponent(code)}`,
      { headers: await authedHeaders(), cache: "no-store" },
    );
    if (!res.ok) return cached?.photos ?? [];
    const json = (await res.json()) as { photos?: AtlasPhoto[] };
    const raw = Array.isArray(json.photos) ? json.photos : [];
    const photos = raw.map((p) => {
      const uri = p.uri?.trim() ?? "";
      const abs =
        uri.startsWith("http") || uri.startsWith("data:") || uri.startsWith("file:")
          ? uri
          : uri.startsWith("/api/photos/")
            ? `${base.replace(/\/$/, "")}${uri}`
            : p.id
              ? serverPhotoImageUrlAtOrigin(String(p.id), base)
              : uri;
      return { ...p, uri: withDisplayPhotoWidth(abs) };
    });
    atlasCountryPhotosCache.set(code, { fetchedAt: now, photos });
    return photos;
  } catch {
    return cached?.photos ?? [];
  }
}
