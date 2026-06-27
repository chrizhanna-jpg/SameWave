import { Platform } from "react-native";
import type * as ImagePicker from "expo-image-picker";

// Echo accepts both authentic camera photos AND AI-generated images. We
// detect likely AI images via EXIF and flag them so the app can show an
// "AI generated" badge. AI photos still upload and can form Ripples/Waves.
//
// Strategy (conservative — only flag on POSITIVE evidence so genuine photos
// that lost metadata in transit are never mislabelled):
//   - source === "camera": always trusted, never AI.
//   - source === "library": flag AI ONLY when the EXIF Software/Make field
//     carries a known AI-generator signature. Missing EXIF / camera
//     make-model / capture date is NOT treated as AI — messaging apps
//     (WhatsApp, Signal, iMessage…), screenshots, social-media downloads, and
//     many photo editors routinely strip that metadata from real photos.
//   - Web bypasses EXIF inspection (picker support is patchy) — those uploads
//     are treated as authentic.

export type PhotoSource = "camera" | "library";

export interface PhotoOriginResult {
  /** True when the image looks AI-generated (or is missing camera EXIF). */
  looksAi: boolean;
  reason?:
    | "no_exif"
    | "ai_software"
    | "no_camera_make_model"
    | "no_capture_date";
}

const AI_SOFTWARE_SIGNATURES = [
  "midjourney",
  "stable diffusion",
  "stable-diffusion",
  "stablediffusion",
  "dall-e",
  "dall·e",
  "dalle",
  "openai",
  "firefly",
  "imagen",
  "bing image",
  "sora",
  "runway",
  "leonardo",
  "ideogram",
  "krea",
  "flux.1",
  "comfyui",
  "automatic1111",
  "invokeai",
  "novelai",
  "nightcafe",
  "playground ai",
  "lexica",
  "civitai",
  "gencraft",
  "starryai",
];

function readField(exif: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = exif[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/**
 * Best-effort extraction of a photo's REAL capture time as an ISO string,
 * for use as the temporal-match basis (Same Hour / Day / Week / Month).
 *
 *   - source === "camera": the in-app camera just took the shot, so the
 *     capture instant ≈ now. We return the current instant.
 *   - source === "library": read EXIF DateTimeOriginal (falling back to
 *     DateTime / CreateDate). EXIF stores a wall-clock string with NO time
 *     zone ("2024:06:01 14:03:22"); we interpret those fields as UTC so the
 *     value is a deterministic instant. This is a documented simplification —
 *     see getTimeTier(), which compares both sides on a fixed UTC calendar,
 *     so the only effect is that "Same Hour" means same UTC wall-clock hour.
 *
 * Returns undefined when no capture date is present (very common: messaging
 * apps, screenshots, social downloads, and many editors strip it). The caller
 * then falls back to upload/share time and surfaces the soft note.
 */
export function extractCaptureDateIso(
  asset: ImagePicker.ImagePickerAsset,
  source: PhotoSource,
): string | undefined {
  if (source === "camera") return new Date().toISOString();

  const exif = (asset.exif ?? {}) as Record<string, unknown>;
  const raw = readField(
    exif,
    "DateTimeOriginal",
    "{Exif}DateTimeOriginal",
    "DateTimeDigitized",
    "DateTime",
    "CreateDate",
  );
  if (!raw) return undefined;

  // EXIF canonical form: "YYYY:MM:DD HH:MM:SS" (sometimes with a "T").
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw);
  if (m) {
    const [, y, mo, d, h, mi, s] = m;
    const ms = Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      s ? Number(s) : 0,
    );
    if (!Number.isFinite(ms)) return undefined;
    // Guard against bad clocks / parsing — a capture date in the future
    // can't be real, so treat it as unknown.
    if (ms > Date.now() + 24 * 60 * 60 * 1000) return undefined;
    return new Date(ms).toISOString();
  }

  // Some platforms hand back an already-parseable date string.
  const fallback = new Date(raw).getTime();
  if (Number.isFinite(fallback) && fallback <= Date.now() + 24 * 60 * 60 * 1000) {
    return new Date(fallback).toISOString();
  }
  return undefined;
}

export function detectPhotoOrigin(
  asset: ImagePicker.ImagePickerAsset,
  source: PhotoSource,
): PhotoOriginResult {
  // Camera path is trusted — the OS just took the photo for us.
  if (source === "camera") return { looksAi: false };

  // Web: skip EXIF inspection (see file header for rationale).
  if (Platform.OS === "web") return { looksAi: false };

  const exif = (asset.exif ?? {}) as Record<string, unknown>;

  // Only flag as AI on POSITIVE provenance evidence — an AI generator's
  // signature in the Software (or Make) field. Absence of EXIF, camera
  // make/model, or a capture date is NOT a reliable AI signal: messaging
  // apps, screenshots, social-media downloads, and many photo editors strip
  // that metadata from genuine photos. Treating "missing metadata" as AI
  // produced constant false positives on real shared photos and eroded
  // trust, so those paths now return authentic.
  const software = readField(
    exif,
    "Software",
    "software",
    "Make",
    "make",
  ).toLowerCase();
  if (
    software &&
    AI_SOFTWARE_SIGNATURES.some((sig) => software.includes(sig))
  ) {
    return { looksAi: true, reason: "ai_software" };
  }

  return { looksAi: false };
}
