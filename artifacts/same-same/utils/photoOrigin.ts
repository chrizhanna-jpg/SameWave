import { Platform } from "react-native";
import type * as ImagePicker from "expo-image-picker";

// Same Same only accepts authentic photos taken with the device's camera.
// We reject AI-generated, downloaded, or otherwise-sourced images by
// inspecting EXIF metadata. Camera-taken photos always pass.
//
// Strategy:
//   - source === "camera": trust the in-app camera capture path.
//   - source === "library": require camera EXIF (Make + Model + capture
//     timestamp) AND no known AI-generator software signature.
//
// Web has no real device-camera path through expo-image-picker, and EXIF
// support there is patchy. We bypass validation on web so the test/dev
// preview keeps working — native release builds enforce the rule.

export type PhotoSource = "camera" | "library";

export interface PhotoOriginResult {
  ok: boolean;
  reason?:
    | "no_exif"
    | "ai_software"
    | "no_camera_make_model"
    | "no_capture_date";
  message?: string;
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

export function validatePhotoOrigin(
  asset: ImagePicker.ImagePickerAsset,
  source: PhotoSource,
): PhotoOriginResult {
  // Camera path is trusted — the OS just took the photo for us.
  if (source === "camera") return { ok: true };

  // Web: skip validation (see file header for rationale).
  if (Platform.OS === "web") return { ok: true };

  const exif = (asset.exif ?? {}) as Record<string, unknown>;
  const hasAnyExif = Object.keys(exif).length > 0;

  if (!hasAnyExif) {
    return {
      ok: false,
      reason: "no_exif",
      message:
        "This photo has no camera information. Same Same only accepts photos taken with your device's camera.",
    };
  }

  const software = readField(exif, "Software", "software").toLowerCase();
  if (
    software &&
    AI_SOFTWARE_SIGNATURES.some((sig) => software.includes(sig))
  ) {
    return {
      ok: false,
      reason: "ai_software",
      message:
        "This photo looks AI-generated. Same Same is for real moments — please take a photo with your camera.",
    };
  }

  const make = readField(exif, "Make", "make");
  const model = readField(exif, "Model", "model");
  if (!make || !model) {
    return {
      ok: false,
      reason: "no_camera_make_model",
      message:
        "This photo doesn't include camera details. Please take a fresh photo with your device's camera.",
    };
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
    return {
      ok: false,
      reason: "no_capture_date",
      message:
        "This photo is missing a capture timestamp. Please take a fresh photo with your device's camera.",
    };
  }

  return { ok: true };
}
