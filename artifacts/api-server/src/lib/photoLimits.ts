import type { NextFunction, Request, Response } from "express";
import express from "express";

/** Decoded original image bytes allowed on POST /api/photos. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** New user photo sends (Ripples) allowed per account in a rolling 24 hours. */
export const MAX_PHOTOS_PER_DAY = 30;

export const PHOTO_TOO_LARGE_ERROR = "Photo is too large (max 5 MB).";
export const PHOTO_DAILY_CAP_ERROR =
  `You can send up to ${MAX_PHOTOS_PER_DAY} photos a day. Try again later.`;

/**
 * Ids written by stock-pool and atlas demo scripts, not by a person's upload.
 * POST /api/photos never assigns these, and the daily cap ignores them.
 */
export const SYSTEM_PHOTO_ID_PREFIXES = ["stock_", "atlas_global_seed_"] as const;

const AUDIO_HEADROOM_BYTES = 1 * 1024 * 1024;
const DISPLAY_HEADROOM_BYTES = 2 * 1024 * 1024;
const PREVIEW_HEADROOM_BYTES = 1 * 1024 * 1024;
const JSON_FIELD_HEADROOM_BYTES = 512 * 1024;

function base64LengthForBytes(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

/**
 * Raw JSON body cap for POST /api/photos. Larger than the 5 MB original so a
 * legal upload still fits after base64 expansion plus display, preview, audio,
 * and the other JSON fields. Anything past this is rejected before the handler.
 */
export const PHOTO_UPLOAD_BODY_LIMIT_BYTES =
  base64LengthForBytes(MAX_PHOTO_BYTES) +
  base64LengthForBytes(DISPLAY_HEADROOM_BYTES) +
  base64LengthForBytes(PREVIEW_HEADROOM_BYTES) +
  base64LengthForBytes(AUDIO_HEADROOM_BYTES) +
  JSON_FIELD_HEADROOM_BYTES;

export function isSystemGeneratedPhotoId(id: string): boolean {
  return SYSTEM_PHOTO_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/** Byte length of a base64 image payload, including an optional data: prefix. */
export function originalPhotoByteLength(imageBase64: string): number {
  const stripped = imageBase64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  if (!stripped) return 0;
  return Buffer.from(stripped, "base64").length;
}

export function photoExceedsByteCap(imageBase64: string): boolean {
  return originalPhotoByteLength(imageBase64) > MAX_PHOTO_BYTES;
}

export class PhotoDailyCapError extends Error {
  constructor() {
    super(PHOTO_DAILY_CAP_ERROR);
    this.name = "PhotoDailyCapError";
  }
}

export function isPhotoDailyCapError(err: unknown): boolean {
  if (err instanceof PhotoDailyCapError) return true;
  if (err && typeof err === "object" && "cause" in err) {
    return isPhotoDailyCapError((err as { cause?: unknown }).cause);
  }
  return false;
}

function isPhotoUploadRequest(req: Request): boolean {
  if (req.method !== "POST") return false;
  const path = req.path.replace(/\/+$/, "") || "/";
  return path === "/api/photos";
}

function isPayloadTooLarge(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const record = err as { type?: unknown; status?: unknown; statusCode?: unknown };
  return (
    record.type === "entity.too.large" ||
    record.status === 413 ||
    record.statusCode === 413
  );
}

const uploadJsonParser = express.json({ limit: PHOTO_UPLOAD_BODY_LIMIT_BYTES });

/**
 * Parses POST /api/photos itself so an oversized body returns JSON 413
 * instead of falling through to the global parser. Other routes are unchanged.
 */
export function photoUploadBodyParser(req: Request, res: Response, next: NextFunction): void {
  if (!isPhotoUploadRequest(req)) {
    next();
    return;
  }
  uploadJsonParser(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (isPayloadTooLarge(err)) {
      res.status(413).json({ error: PHOTO_TOO_LARGE_ERROR });
      return;
    }
    next(err);
  });
}
