/**
 * The SameWave API, exactly as the server already exposes it.
 * Nothing on the server was changed for this client.
 */
import { parseCaptureCountrySource } from "../core/captureCountry";
import { normalizeCountryCode } from "../data/countries";
import type { Candidate, Offer, Wave, WaveSide } from "../core/types";
import {
  BackendError,
  type Backend,
  type CandidateQuery,
  type ImageSource,
  type OfferResult,
  type RippleUpload,
  type SentRipple,
  type VibeDetail,
  type WaveDetail,
} from "./types";

export interface HttpBackendOptions {
  /** e.g. https://samewave.onrender.com */
  origin: string;
  /** The current session token. `fresh` asks for a new one rather than a cached one. */
  getToken: (options?: { fresh?: boolean }) => Promise<string | null>;
  /** Id the previous app sent, so photos from before sign-in stay with the account. */
  getDeviceId?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  /** The hosted API sleeps when idle and can take most of a minute to wake. */
  timeoutMs?: number;
  uploadTimeoutMs?: number;
}

interface RequestOptions {
  body?: unknown;
  timeoutMs?: number;
  /** Safe to send twice. Retried once if the server is unreachable or fails. */
  repeatable?: boolean;
}

type Json = Record<string, unknown>;

function isoOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** The server builds data: URIs from database columns. Reject the empty ones. */
function imageUriOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]{64,}$/i.test(value) ? value : null;
}

function waveSide(raw: unknown): WaveSide | null {
  if (!raw || typeof raw !== "object") return null;
  const side = raw as Json;
  const photoId = typeof side.id === "string" ? side.id : "";
  if (!photoId) return null;
  const capture = normalizeCountryCode(side.captureCountryCode as string | null);
  const home = normalizeCountryCode(side.countryCode as string | null);
  const fromServer = parseCaptureCountrySource(side.captureCountrySource);
  const theme = typeof side.theme === "string" && side.theme ? side.theme : null;
  const emotion = typeof side.emotion === "string" && side.emotion ? side.emotion : null;
  return {
    photoId,
    uri: imageUriOrNull(side.uri),
    countryCode: capture ?? home,
    // Server null/missing provenance → approximate fallback (incl. legacy rows).
    countrySource: fromServer ?? "fallback",
    takenAt: isoOrNull(side.capturedAt) ?? isoOrNull(side.createdAt),
    theme,
    emotion,
  };
}

/** Map one `/echoes/*` card (server wire name) into a Wave. */
export function waveFromCard(raw: unknown): Wave | null {
  if (!raw || typeof raw !== "object") return null;
  const card = raw as Json;
  const id = card.id === undefined || card.id === null ? "" : String(card.id);
  const mine = waveSide(card.mine);
  const theirs = waveSide(card.theirs);
  if (!id || !mine || !theirs) return null;
  return { id, formedAt: isoOrNull(card.mutualAt) ?? isoOrNull(card.createdAt), mine, theirs };
}

/** Map one `/echoes/inbox` card (server wire name) into an Offer. */
export function offerFromCard(raw: unknown): Offer | null {
  if (!raw || typeof raw !== "object") return null;
  const card = raw as Json;
  const id = card.id === undefined || card.id === null ? "" : String(card.id);
  const mine = (card.mine ?? {}) as Json;
  const theirs = (card.theirs ?? {}) as Json;
  if (!id || typeof mine.id !== "string" || typeof theirs.id !== "string") return null;
  const theirTopic =
    typeof theirs.theme === "string" && theirs.theme
      ? theirs.theme
      : typeof card.theme === "string" && card.theme
        ? card.theme
        : null;
  const capture =
    typeof theirs.captureCountryCode === "string" && theirs.captureCountryCode
      ? theirs.captureCountryCode
      : null;
  const home =
    typeof theirs.countryCode === "string" && theirs.countryCode ? theirs.countryCode : null;
  const rawUri = typeof theirs.uri === "string" ? theirs.uri : null;
  // Inbox cards are usually data: URIs from the server; also accept https /api paths.
  const theirUri =
    imageUriOrNull(rawUri) ??
    (rawUri && /^(https?:\/\/|\/api\/photos\/)/i.test(rawUri) ? rawUri : null);
  return {
    id,
    myPhotoId: mine.id,
    theirPhotoId: theirs.id,
    createdAt: isoOrNull(card.createdAt),
    theirUri,
    theirEmotion:
      typeof theirs.emotion === "string" && theirs.emotion ? theirs.emotion : null,
    theirTopic,
    theirCountryCode: capture ?? home,
  };
}

/**
 * Vote response field `echo` on the live API — mutual → Wave, pending → waiting.
 * Path and JSON keys stay server-shaped; the app speaks Wave/Ripple.
 */
function offerResultFromVote(body: Json): OfferResult {
  // Wire: body.echo === "mutual" | "pending" | …
  if (body.echo === "mutual") return "wave";
  return body.echo === "pending" ? "waiting" : "skipped";
}

/** Wire array `echoes` on `/echoes/inbox` and `/echoes/mine`. */
function cardsFromEchoesPayload(body: Json): unknown[] {
  return Array.isArray(body.echoes) ? body.echoes : [];
}

export function candidateFromRow(raw: unknown): Candidate | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Json;
  if (typeof row.id !== "string" || typeof row.uri !== "string") return null;
  const score = Number(row.score);
  return {
    id: row.id,
    uri: row.uri,
    score: Number.isFinite(score) ? score : 0,
    createdAt: isoOrNull(row.createdAt),
    theme: typeof row.theme === "string" && row.theme ? row.theme : null,
    // Feeling only — never fall back to musicGenre (song / vibe clip).
    emotion: typeof row.emotion === "string" && row.emotion ? row.emotion : null,
    countryCode:
      typeof row.captureCountryCode === "string" && row.captureCountryCode
        ? row.captureCountryCode
        : typeof row.countryCode === "string" && row.countryCode
          ? row.countryCode
          : null,
    takenAt: isoOrNull(row.capturedAt) ?? isoOrNull(row.createdAt),
    wavedAtYou: row.wavedAtYou === true || row.wavedAtYou === "t" || row.wavedAtYou === 1,
  };
}

function vibeDetail(raw: unknown): VibeDetail {
  const side = (raw && typeof raw === "object" ? raw : {}) as Json;
  const audio = typeof side.customAudioBase64 === "string" ? side.customAudioBase64 : "";
  const mime = typeof side.customAudioMime === "string" ? side.customAudioMime : "";
  return {
    vibe: typeof side.musicGenre === "string" && side.musicGenre ? side.musicGenre : null,
    recordingUri: audio && mime.startsWith("audio/") ? `data:${mime};base64,${audio}` : null,
    // Feeling only — null when missing (do not use musicGenre as emotion).
    emotion: typeof side.emotion === "string" && side.emotion ? side.emotion : null,
    topic: typeof side.theme === "string" && side.theme ? side.theme : null,
  };
}

export function createHttpBackend(options: HttpBackendOptions): Backend {
  const origin = options.origin.replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 45_000;
  const uploadTimeoutMs = options.uploadTimeoutMs ?? 120_000;

  async function headers(fresh: boolean): Promise<Record<string, string>> {
    const token = await options.getToken({ fresh }).catch(() => null);
    if (!token) throw new BackendError("signed-out", "No session");
    const out: Record<string, string> = { Authorization: `Bearer ${token}` };
    const deviceId = await options.getDeviceId?.().catch(() => null);
    if (deviceId) out["X-Device-Id"] = deviceId;
    return out;
  }

  async function once(
    method: string,
    path: string,
    request: RequestOptions,
    freshToken: boolean,
  ): Promise<Json> {
    const auth = await headers(freshToken);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? timeoutMs);
    let response: Response;
    try {
      response = await doFetch(`${origin}/api${path}`, {
        method,
        headers: {
          ...auth,
          Accept: "application/json",
          ...(request.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: controller.signal,
      });
    } catch (error) {
      throw new BackendError(
        "unreachable",
        error instanceof Error ? error.message : "Network request failed",
      );
    } finally {
      clearTimeout(timer);
    }

    let payload: Json = {};
    try {
      const parsed: unknown = await response.json();
      if (parsed && typeof parsed === "object") payload = parsed as Json;
    } catch {
      if (response.ok) throw new BackendError("server", "Unreadable response", response.status);
    }
    if (response.ok) return payload;

    const message = typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`;
    if (response.status === 401) throw new BackendError("signed-out", message, 401);
    if (response.status === 404) throw new BackendError("not-found", message, 404);
    if (response.status >= 500) throw new BackendError("server", message, response.status);
    throw new BackendError("rejected", message, response.status);
  }

  async function call(method: string, path: string, request: RequestOptions = {}): Promise<Json> {
    try {
      return await once(method, path, request, false);
    } catch (error) {
      if (!(error instanceof BackendError)) throw error;
      // Session tokens last about a minute, so a refused one is retried once with a new one.
      if (error.kind === "signed-out" && error.status === 401) {
        return once(method, path, request, true);
      }
      if (request.repeatable && (error.kind === "unreachable" || error.kind === "server")) {
        return once(method, path, request, false);
      }
      throw error;
    }
  }

  const id = (value: string) => encodeURIComponent(value);

  return {
    async getCountry() {
      // Boot calls this once after sign-in. One 25s attempt (Render wake) beats
      // two stacked 45s retries that look like an infinite spinner in Expo Go.
      const body = await call("GET", "/users/me", { timeoutMs: 25_000, repeatable: false });
      return normalizeCountryCode(body.countryCode as string | null);
    },

    async setCountry(countryCode) {
      await call("PATCH", "/users/me", { body: { countryCode }, repeatable: true });
    },

    async sendRipple(upload: RippleUpload): Promise<SentRipple> {
      const body = await call("POST", "/photos", {
        timeoutMs: uploadTimeoutMs,
        body: {
          imageBase64: upload.displayBase64,
          mimeType: "image/jpeg",
          displayBase64: upload.displayBase64,
          deckPreviewBase64: upload.previewBase64,
          ...(upload.countryCode ? { countryCode: upload.countryCode } : {}),
          ...(upload.captureCountryCode ? { captureCountryCode: upload.captureCountryCode } : {}),
          // Harmless extra: Express reads known keys only; server does not store this yet.
          ...(upload.captureCountrySource
            ? { captureCountrySource: upload.captureCountrySource }
            : {}),
          ...(upload.capturedAt ? { capturedAt: upload.capturedAt } : {}),
          // Feeling and song are separate: emotion = Feeling, musicGenre = song.
          ...(upload.emotion ? { emotion: upload.emotion } : {}),
          ...(upload.song ? { musicGenre: upload.song } : {}),
          ...(upload.topic ? { theme: upload.topic } : {}),
          ...(upload.recording
            ? {
                customAudioBase64: upload.recording.base64,
                customAudioMime: upload.recording.mime,
              }
            : {}),
        },
      });
      if (typeof body.id !== "string" || !body.id) {
        throw new BackendError("server", "Upload returned no photo id");
      }
      return {
        photoId: body.id,
        theme: typeof body.theme === "string" ? body.theme : "",
        tags: stringList(body.tags),
        subjects: stringList(body.subjects),
      };
    },

    async deletePhoto(photoId) {
      await call("DELETE", `/photos/${id(photoId)}`, { repeatable: true });
    },

    async reportPhoto(photoId, reason) {
      await call("POST", `/photos/${id(photoId)}/report`, { body: { reason }, repeatable: true });
    },

    async findCandidates(query: CandidateQuery): Promise<Candidate[]> {
      const params = new URLSearchParams();
      if (query.theme) params.set("theme", query.theme);
      if (query.tags.length) params.set("tags", query.tags.join(","));
      if (query.subjects.length) params.set("subjects", query.subjects.join(","));
      // Feeling and song are separate query params — never map emotion → musicGenre.
      if (query.emotion) params.set("emotion", query.emotion);
      if (query.musicGenre) params.set("musicGenre", query.musicGenre);
      if (query.voterPhotoId) params.set("voterPhotoId", query.voterPhotoId);
      params.set("limit", String(query.limit));
      if (query.excludeIds.length) params.set("excludeIds", query.excludeIds.slice(-200).join(","));
      const body = await call("GET", `/photos/candidates?${params.toString()}`, {
        repeatable: true,
      });
      const rows = Array.isArray(body.photos) ? body.photos : [];
      return rows.map(candidateFromRow).filter((c): c is Candidate => c !== null);
    },

    async offer(myPhotoId, theirPhotoId): Promise<OfferResult> {
      const body = await call("POST", `/photos/${id(theirPhotoId)}/vote`, {
        body: { verdict: "same", voterPhotoId: myPhotoId },
        repeatable: true,
      });
      return offerResultFromVote(body);
    },

    async pass(photoId) {
      await call("POST", `/photos/${id(photoId)}/vote`, {
        body: { verdict: "different" },
        repeatable: true,
      });
    },

    /** Pending matches waiting on the user — live path `/echoes/inbox`. */
    async listOffers(): Promise<Offer[]> {
      const body = await call("GET", "/echoes/inbox", { repeatable: true });
      return cardsFromEchoesPayload(body)
        .map(offerFromCard)
        .filter((o): o is Offer => o !== null);
    },

    async acceptOffer(offerId) {
      await call("POST", `/echoes/${id(offerId)}/respond`, {
        body: { verdict: "same" },
        repeatable: true,
      });
    },

    async dismissOffer(offerId) {
      await call("POST", `/echoes/${id(offerId)}/respond`, {
        body: { verdict: "different" },
        repeatable: true,
      });
    },

    /** Completed Waves — live path `/echoes/mine`. */
    async listWaves(): Promise<Wave[]> {
      const body = await call("GET", "/echoes/mine", { repeatable: true });
      return cardsFromEchoesPayload(body)
        .map(waveFromCard)
        .filter((w): w is Wave => w !== null);
    },

    async getWaveDetail(wave: Wave): Promise<WaveDetail> {
      const body = await call(
        "GET",
        `/echoes/pair?a=${id(wave.mine.photoId)}&b=${id(wave.theirs.photoId)}`,
        { repeatable: true },
      );
      return { mine: vibeDetail(body.a), theirs: vibeDetail(body.b) };
    },

    async registerPushToken(token, platform) {
      await call("POST", "/push-tokens", { body: { token, platform }, repeatable: true });
    },

    async unregisterPushToken(token) {
      await call("DELETE", "/push-tokens", {
        body: { token },
        repeatable: true,
      });
    },

    async photoSource(photoId): Promise<ImageSource> {
      return {
        uri: `${origin}/api/photos/${id(photoId)}/image`,
        headers: await headers(false),
      };
    },
  };
}
