import type { AtlasConnection } from "@/utils/api";

export type WavefireThemeCaption = {
  key: string;
  theme: string;
  countryCode?: string;
};

type ExploreTile = {
  key: string;
  theme: string;
  participant: { countryCode: string; photoId?: string };
};

/** Per-user upload themes for the Wavefire ring center carousel. */
export function buildWavefireThemeCaptions(
  exploreTiles: ExploreTile[],
  connections: AtlasConnection[],
  displayTheme: string,
): WavefireThemeCaption[] {
  const out: WavefireThemeCaption[] = [];
  const seen = new Set<string>();

  for (const tile of exploreTiles) {
    const theme = tile.theme.trim();
    if (!theme) continue;
    const dedupe = `${theme.toLowerCase()}|${tile.participant.countryCode}|${tile.participant.photoId ?? tile.key}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      key: tile.key,
      theme,
      countryCode: tile.participant.countryCode,
    });
  }

  if (out.length === 0) {
    for (const c of connections) {
      const theme = (c.theme ?? "").trim();
      if (!theme) continue;
      const dedupe = `${theme.toLowerCase()}|${c.id}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({
        key: c.id,
        theme,
        countryCode: c.from,
      });
    }
  }

  const fallback = displayTheme.trim();
  if (out.length === 0 && fallback) {
    out.push({ key: "cluster-display", theme: fallback });
  }

  return out;
}
