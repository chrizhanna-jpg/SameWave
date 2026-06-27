import { DAILY_CHALLENGES } from "@/data/samplePhotos";
import { getCatalogThemeEmoji } from "@/utils/serverCatalog";

/** Matches camera theme input cap (`app/camera.tsx` maxLength). */
export const UPLOAD_THEME_MAX_LENGTH = 40;

export type ThemeDisplay = {
  title: string;
  emoji: string;
};

/** Upload theme string → emoji + readable title (not challenge catalog title). */
export function resolveThemeDisplay(raw: string): ThemeDisplay {
  const t = raw.trim();
  if (!t) return { title: "Moment", emoji: "✨" };
  const meta = DAILY_CHALLENGES.find(
    (c) => c.id === t || c.title.toLowerCase() === t.toLowerCase(),
  );
  // Server-driven approved entries layer on top of the hardcoded presets:
  // an owner-approved submitted word resolves to its assigned emoji. Presets
  // remain the base; falls back to ✨ offline / when nothing matches.
  const serverEmoji = getCatalogThemeEmoji(t);
  return { title: t, emoji: serverEmoji ?? meta?.emoji ?? "✨" };
}

/**
 * Prefer full theme text with word-aware wrap in UI. If legacy data exceeds the
 * upload cap, trim at the last space before the limit (never mid-word).
 */
export function formatThemeTitleForDisplay(
  raw: string,
  maxChars = UPLOAD_THEME_MAX_LENGTH,
): string {
  const t = raw.trim();
  if (t.length <= maxChars) return t;
  const head = t.slice(0, maxChars);
  const lastSpace = head.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxChars * 0.45)) {
    return head.slice(0, lastSpace).trimEnd();
  }
  return head.trimEnd();
}
