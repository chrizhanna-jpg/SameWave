import { Platform } from "react-native";
import type * as ImagePicker from "expo-image-picker";

// Echo accepts both authentic camera photos AND AI-generated images. We
// detect likely AI images via EXIF and flag them so the app can show an
// "AI generated" badge. AI photos still upload and can form Ripples/Waves.
//
// Strategy:
//   - source === "camera": always trusted, never AI.
//   - source === "library": inspect EXIF for AI-generator software signatures
//     and missing camera metadata. Failing checks => looksAi = true.
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

export function detectPhotoOrigin(
  asset: ImagePicker.ImagePickerAsset,
  source: PhotoSource,
): PhotoOriginResult {
  // Camera path is trusted — the OS just took the photo for us.
  if (source === "camera") return { looksAi: false };

  // Web: skip EXIF inspection (see file header for rationale).
  if (Platform.OS === "web") return { looksAi: false };

  const exif = (asset.exif ?? {}) as Record<string, unknown>;
  const hasAnyExif = Object.keys(exif).length > 0;

  if (!hasAnyExif) {
    return { looksAi: true, reason: "no_exif" };
  }

  const software = readField(exif, "Software", "software").toLowerCase();
  if (
    software &&
    AI_SOFTWARE_SIGNATURES.some((sig) => software.includes(sig))
  ) {
    return { looksAi: true, reason: "ai_software" };
  }

  const make = readField(exif, "Make", "make");
  const model = readField(exif, "Model", "model");
  if (!make || !model) {
    return { looksAi: true, reason: "no_camera_make_model" };
  }

  const dateOriginal = readField(
    exif,
    "DateTimeOriginal",
    "dateTimeOriginal",
    "DateTime",
    "dateTime",
    "{Exif}DateTimeOriginal",
  );
  if (!dateOriginal) {
    return { looksAi: true, reason: "no_capture_date" };
  }

  return { looksAi: false };
}
