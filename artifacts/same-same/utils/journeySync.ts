import type { Match } from "@/context/AppContext";
import { photoCountryDisplay } from "@/utils/photoCountry";
import { getPublicApiOrigin } from "@/utils/publicEnv";

/** Row shape from `GET /api/photos/my-journey`. */
export type ServerJourneyMatch = {
  id: string;
  verdict: "same" | "different";
  timestamp: string;
  theirPhotoId: string;
  myPhotoId: string | null;
  theirCaptureCountryCode: string | null;
  theirCountryCode: string | null;
  myCaptureCountryCode: string | null;
  myCountryCode: string | null;
  theme: string | null;
  tags: string[];
  musicGenre: string | null;
  myPhotoUploadedAt: string | null;
  theirPhotoActive: boolean;
  myPhotoActive: boolean;
};

export function serverPhotoImageUrl(photoId: string): string {
  const id = photoId.trim();
  if (!id) return "";
  const base = getPublicApiOrigin().replace(/\/$/, "");
  return `${base}/api/photos/${encodeURIComponent(id)}/image`;
}

/** Map cloud journey row → local Match (HTTPS image URLs for persistence). */
export function mapServerJourneyToMatch(row: ServerJourneyMatch): Match {
  const myDisp = photoCountryDisplay(
    row.myCaptureCountryCode,
    row.myCountryCode,
  );
  const theirDisp = photoCountryDisplay(
    row.theirCaptureCountryCode,
    row.theirCountryCode,
  );
  const myPhoto =
    row.myPhotoId && row.myPhotoActive
      ? serverPhotoImageUrl(row.myPhotoId)
      : "";
  const theirPhoto = row.theirPhotoActive
    ? serverPhotoImageUrl(row.theirPhotoId)
    : "";

  return {
    id: row.id,
    theirPhotoId: row.theirPhotoId,
    myPhoto,
    theirPhoto,
    myCountry: myDisp.name,
    myCountryCode: myDisp.code,
    myCountryFlag: myDisp.flag,
    theirCountry: theirDisp.name,
    theirCountryFlag: theirDisp.flag,
    theirCountryCode: theirDisp.code ?? "",
    myCaptureCountryCode: row.myCaptureCountryCode ?? undefined,
    theirCaptureCountryCode: row.theirCaptureCountryCode ?? undefined,
    similarityScore: 0,
    verdict: row.verdict,
    timestamp: row.timestamp,
    theme: row.theme ?? undefined,
    theirActualTheme: row.theme ?? undefined,
    theirTags: row.tags,
    theirMusicGenre: row.musicGenre ?? undefined,
    myPhotoUploadedAt: row.myPhotoUploadedAt ?? undefined,
  };
}
