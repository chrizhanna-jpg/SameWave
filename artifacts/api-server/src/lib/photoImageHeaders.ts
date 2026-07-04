import crypto from "crypto";
import type { Request, Response } from "express";

/** Stable ETag for a versioned user thumbnail stream. */
export function photoStreamEtag(
  photoId: string,
  width: number,
  buf: Buffer,
): string {
  const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
  return `"${photoId}-w${width}-${hash}"`;
}

/** User-upload thumbnail caching — short TTL + long SWR, validated via ETag. */
export function userPhotoCacheControl(): string {
  return "private, max-age=3600, stale-while-revalidate=86400";
}

export function sendPhotoImageBytes(
  req: Request,
  res: Response,
  buf: Buffer,
  mime: string,
  photoId: string,
  width: number,
  lastModified?: Date | null,
): void {
  const etag = photoStreamEtag(photoId, width, buf);
  const inm = req.header("if-none-match")?.trim();
  if (inm && inm === etag) {
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", userPhotoCacheControl());
    if (lastModified) {
      res.setHeader("Last-Modified", lastModified.toUTCString());
    }
    res.status(304).end();
    return;
  }
  res.setHeader("Content-Type", mime);
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", userPhotoCacheControl());
  if (lastModified) {
    res.setHeader("Last-Modified", lastModified.toUTCString());
  }
  res.send(buf);
}
