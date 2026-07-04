import { DAILY_CHALLENGES, resolveChallengeThemeId } from "@/data/samplePhotos";

export function resolveThemeChip(raw: string): { title: string; emoji: string } {
  const t = raw.trim();
  if (!t) return { title: "", emoji: "✨" };
  const canonical = resolveChallengeThemeId(t);
  const meta = DAILY_CHALLENGES.find(
    (c) => c.id === canonical || c.title.toLowerCase() === t.toLowerCase(),
  );
  return { title: meta?.title ?? t, emoji: meta?.emoji ?? "✨" };
}

/**
 * Share-card topic chip: both upload themes on a Wave (middle dot when different).
 */
export function formatDualWaveThemes(
  themeA: string | undefined | null,
  themeB: string | undefined | null,
): { title: string; emoji: string } {
  const a = resolveThemeChip(themeA ?? "");
  const b = resolveThemeChip(themeB ?? "");
  const parts = [a, b].filter((p) => p.title.length > 0);
  if (parts.length === 0) {
    return { title: "Moment", emoji: "✨" };
  }
  const norm = (s: string) => s.trim().toLowerCase();
  if (parts.length === 1 || norm(parts[0].title) === norm(parts[1].title)) {
    return { title: parts[0].title, emoji: parts[0].emoji };
  }
  return {
    title: `${parts[0].emoji} ${parts[0].title} · ${parts[1].emoji} ${parts[1].title}`,
    emoji: "✨",
  };
}
