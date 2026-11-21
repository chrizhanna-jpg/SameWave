/**
 * The account's photo history. The server has no "my photos" list, so the
 * device keeps one: every Ripple sent from here, plus the user's photos that
 * appear in their Waves, plus photos carried over from the previous app.
 */
import { normalizeCountryCode } from "../data/countries";
import type { Ripple, Wave } from "./types";

function emptyReach(): Ripple["reach"] {
  return { passes: 0, lastPassAt: null, offeredIds: [] };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function isoFrom(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  const s = text(value);
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Reads the photo list the previous app stored under `samesame_state`.
 * Only photos that reached the server are kept. Anything unreadable is skipped.
 */
export function ripplesFromLegacyState(raw: string | null): Ripple[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const photos = (parsed as { myPhotos?: unknown }).myPhotos;
  if (!Array.isArray(photos)) return [];

  const out: Ripple[] = [];
  const seen = new Set<string>();
  for (const entry of photos) {
    if (!entry || typeof entry !== "object") continue;
    const photo = entry as Record<string, unknown>;
    const photoId = text(photo.backendId);
    if (!photoId || seen.has(photoId)) continue;
    seen.add(photoId);
    const uri = text(photo.uri);
    out.push({
      photoId,
      sentAt: isoFrom(photo.uploadedAt) ?? isoFrom(photo.capturedAt) ?? new Date(0).toISOString(),
      localUri: uri && /^(file|content):/i.test(uri) ? uri : null,
      countryCode: normalizeCountryCode(
        text(photo.captureCountryCode) ?? text(photo.declaredCountryCode),
      ),
      emotion: text(photo.musicGenre),
      topic: text(photo.theme),
      vibe: text(photo.musicGenre),
      hasRecording: text(photo.customAudioUrl) !== null,
      theme: text(photo.theme) ?? "",
      tags: strings(photo.tags),
      subjects: strings(photo.subjects),
      reach: emptyReach(),
    });
  }
  return out;
}

/** One list, newest first, with no photo repeated. Earlier lists win. */
export function mergeRipples(...lists: readonly (readonly Ripple[])[]): Ripple[] {
  const byId = new Map<string, Ripple>();
  for (const list of lists) {
    for (const ripple of list) {
      if (!byId.has(ripple.photoId)) byId.set(ripple.photoId, ripple);
    }
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt));
}

export interface HistoryPhoto {
  photoId: string;
  sentAt: string | null;
  /** A local file, the photo from a Wave, or null when only the server has it. */
  uri: string | null;
}

/** Everything the user has sent that this device knows about, newest first. */
export function photoHistory(ripples: readonly Ripple[], waves: readonly Wave[]): HistoryPhoto[] {
  const byId = new Map<string, HistoryPhoto>();
  for (const ripple of ripples) {
    byId.set(ripple.photoId, {
      photoId: ripple.photoId,
      sentAt: ripple.sentAt,
      uri: ripple.localUri,
    });
  }
  for (const wave of waves) {
    const known = byId.get(wave.mine.photoId);
    if (known) {
      if (!known.uri) known.uri = wave.mine.uri;
    } else {
      byId.set(wave.mine.photoId, {
        photoId: wave.mine.photoId,
        sentAt: wave.mine.takenAt,
        uri: wave.mine.uri,
      });
    }
  }
  return [...byId.values()].sort(
    (a, b) => (Date.parse(b.sentAt ?? "") || 0) - (Date.parse(a.sentAt ?? "") || 0),
  );
}

export function newRipple(input: {
  photoId: string;
  sentAt: string;
  localUri: string | null;
  countryCode: string | null;
  emotion: string | null;
  topic: string | null;
  /** Library mood sent as musicGenre; defaults to emotion. */
  vibe?: string | null;
  hasRecording: boolean;
  theme: string;
  tags: string[];
  subjects: string[];
}): Ripple {
  const { vibe, ...rest } = input;
  return {
    ...rest,
    vibe: vibe ?? input.emotion,
    reach: emptyReach(),
  };
}
