/**
 * Everything that touches photo files: choosing one, shrinking it for
 * upload, and keeping copies on the device so pictures always have
 * something to show without another trip to the server.
 */
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

import { wavePhotoSlot } from "@/core/wavePhotoSlot";
import { waveLayoutMetrics } from "@/device/waveLayoutMetrics";

export interface ChosenPhoto {
  uri: string;
  /** When the photo was taken. ISO string, or null when unknown. */
  takenAt: string | null;
  /** Where it was taken, when the photo itself says. */
  coords: { latitude: number; longitude: number } | null;
  source: "camera" | "library";
}

/** Sizes the server stores. It skips its own resizing when it receives both. */
const DISPLAY = { width: 960, quality: 0.82 };
const PREVIEW = { width: 480, quality: 0.8 };

function stripPrefix(base64: string): string {
  return base64.replace(/^data:[^;]+;base64,/, "").trim();
}

async function resize(uri: string, width: number, quality: number): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width } }], {
    compress: quality,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  const base64 = stripPrefix(result.base64 ?? "");
  if (!base64) throw new Error("The photo could not be prepared");
  return base64;
}

export interface EncodedPhoto {
  displayBase64: string;
  previewBase64: string;
}

/** Throws when the photo cannot be read or resized. */
export async function encodeForUpload(uri: string): Promise<EncodedPhoto> {
  const [displayBase64, previewBase64] = await Promise.all([
    resize(uri, DISPLAY.width, DISPLAY.quality),
    resize(uri, PREVIEW.width, PREVIEW.quality),
  ]);
  return { displayBase64, previewBase64 };
}

/**
 * Centre-crop (with a slight upward bias) to the Wave photo-slot aspect so the
 * match screen can show the frame without further surprise cropping. The bias
 * keeps faces/subjects above the wave seam that clips the bottom of the top photo.
 */
export async function cropToWaveSlot(uri: string, aspectRatio?: number): Promise<string> {
  const { width: sw, height: sh } = waveLayoutMetrics();
  const target = aspectRatio ?? wavePhotoSlot(sw, sh).aspectRatio;
  if (!Number.isFinite(target) || target <= 0) return uri;

  const probe = await ImageManipulator.manipulateAsync(uri, [], {
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const width = probe.width;
  const height = probe.height;
  if (!width || !height) return uri;

  const current = width / height;
  let originX = 0;
  let originY = 0;
  let cropW = width;
  let cropH = height;

  if (current > target) {
    // Too wide — trim the sides.
    cropW = Math.max(1, Math.round(height * target));
    originX = Math.round((width - cropW) / 2);
  } else if (current < target) {
    // Too tall — trim height, bias toward the top so the seam edge is emptier.
    cropH = Math.max(1, Math.round(width / target));
    originY = Math.round((height - cropH) * 0.32);
  } else {
    return uri;
  }

  const cropped = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop: { originX, originY, width: cropW, height: cropH } }],
    { compress: 1, format: ImageManipulator.SaveFormat.JPEG },
  );
  return cropped.uri;
}

const canUseFiles = Platform.OS !== "web";

function safeName(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
}

async function ensureDir(dir: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

async function writeJpeg(dir: string, name: string, base64: string): Promise<string> {
  await ensureDir(dir);
  const path = `${dir}${name}.jpg`;
  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
}

/**
 * Keeps the user's own photo on the device for their history.
 * Returns something an image view can show. Never throws: without a copy the
 * history falls back to loading the photo from the server.
 */
export async function keepRipplePhoto(encoded: EncodedPhoto): Promise<string | null> {
  if (!canUseFiles) return `data:image/jpeg;base64,${encoded.previewBase64}`;
  const root = FileSystem.documentDirectory;
  if (!root) return null;
  try {
    return await writeJpeg(`${root}ripples/`, `ripple-${Date.now()}`, encoded.displayBase64);
  } catch {
    return null;
  }
}

export async function removeRipplePhoto(uri: string | null): Promise<void> {
  if (!canUseFiles || !uri || !uri.startsWith("file:")) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // The file is already gone or will be cleared with the app's data.
  }
}

/**
 * The server sends Wave photos inside the list response. On a phone they are
 * written to the cache once and shown from there, so they appear at once on
 * the next launch and the list is not held in memory as text.
 * Returns the original value when a file cannot be used.
 */
export async function cacheWavePhoto(photoId: string, uri: string | null): Promise<string | null> {
  if (!uri || !canUseFiles || !uri.startsWith("data:")) return uri;
  const root = FileSystem.cacheDirectory;
  if (!root) return uri;
  try {
    const dir = `${root}waves/`;
    const path = `${dir}${safeName(photoId)}.jpg`;
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists && (info.size ?? 0) > 0) return path;
    return await writeJpeg(dir, safeName(photoId), stripPrefix(uri));
  } catch {
    return uri;
  }
}

/** Writes a recording that arrived as text to a file the audio player can open. */
export async function cacheRecording(photoId: string, uri: string): Promise<string> {
  if (!canUseFiles || !uri.startsWith("data:")) return uri;
  const root = FileSystem.cacheDirectory;
  if (!root) return uri;
  try {
    const dir = `${root}recordings/`;
    await ensureDir(dir);
    const extension = /^data:audio\/(mpeg|mp3)/i.test(uri) ? "mp3" : "m4a";
    const path = `${dir}${safeName(photoId)}.${extension}`;
    await FileSystem.writeAsStringAsync(path, stripPrefix(uri), {
      encoding: FileSystem.EncodingType.Base64,
    });
    return path;
  } catch {
    return uri;
  }
}

export async function readFileBase64(uri: string): Promise<string> {
  if (canUseFiles) {
    return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  }
  const blob = await (await fetch(uri)).blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The recording could not be read"));
    reader.onloadend = () => resolve(stripPrefix(String(reader.result ?? "")));
    reader.readAsDataURL(blob);
  });
}

type Exif = Record<string, unknown>;

function field(exif: Exif, ...names: string[]): unknown {
  for (const name of names) {
    const value = exif[name];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return undefined;
}

/** EXIF dates look like "2026:10:30 08:10:00", in the camera's local time. */
export function takenAtFromExif(exif: Exif | null | undefined): string | null {
  if (!exif) return null;
  const raw = field(exif, "DateTimeOriginal", "DateTimeDigitized", "DateTime");
  if (typeof raw !== "string") return null;
  const match = raw.match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const offset = field(exif, "OffsetTimeOriginal", "OffsetTime");
  const zone = typeof offset === "string" && /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : "";
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${zone}`);
  const ms = date.getTime();
  // A photo cannot have been taken in the future; a wrong camera clock is treated as unknown.
  if (!Number.isFinite(ms) || ms > Date.now() + 24 * 60 * 60 * 1000) return null;
  return date.toISOString();
}

function degrees(value: unknown, ref: unknown): number | null {
  let decimal: number | null = null;
  if (typeof value === "number") decimal = value;
  else if (typeof value === "string" && value.trim() !== "") decimal = Number(value);
  else if (Array.isArray(value) && value.length >= 3) {
    const [deg, min, sec] = value.map(Number) as [number, number, number];
    decimal = deg + min / 60 + sec / 3600;
  }
  if (decimal === null || !Number.isFinite(decimal)) return null;
  const direction = String(ref ?? "").trim().toUpperCase();
  if (direction === "S" || direction === "W") return -Math.abs(decimal);
  if (direction === "N" || direction === "E") return Math.abs(decimal);
  return decimal;
}

export function coordsFromExif(
  exif: Exif | null | undefined,
): { latitude: number; longitude: number } | null {
  if (!exif) return null;
  const block = field(exif, "GPS", "{GPS}");
  const gps = block && typeof block === "object" ? (block as Exif) : exif;
  const latitude = degrees(
    field(gps, "Latitude", "GPSLatitude", "latitude"),
    field(gps, "LatitudeRef", "GPSLatitudeRef"),
  );
  const longitude = degrees(
    field(gps, "Longitude", "GPSLongitude", "longitude"),
    field(gps, "LongitudeRef", "GPSLongitudeRef"),
  );
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

/** Opens the system photo picker. Returns null when the user backs out. */
export async function chooseFromLibrary(): Promise<ChosenPhoto | null> {
  const { width: sw, height: sh } = waveLayoutMetrics();
  const slot = wavePhotoSlot(sw, sh);
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: false,
    quality: 1,
    exif: true,
    // Best-effort in-picker crop; we still crop with ImageManipulator below.
    aspect: [Math.round(slot.aspectRatio * 1000), 1000],
    allowsEditing: Platform.OS === "ios",
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset?.uri) return null;
  const exif = (asset.exif ?? null) as Exif | null;
  const uri = await cropToWaveSlot(asset.uri, slot.aspectRatio).catch(() => asset.uri);
  return {
    uri,
    takenAt: takenAtFromExif(exif),
    coords: coordsFromExif(exif),
    source: "library",
  };
}
