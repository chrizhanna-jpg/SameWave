/** Design spec baseline — all share posters scale from this square. */
export const SHARE_DESIGN_SIZE = 1080;

export type SharePosterVariant = "ripple" | "wave";

/** Logo palette — sky cyan, royal blue, spring green, deep navy. */
export const SHARE_COLORS = {
  navy: "#0A2552",
  navyMid: "#133370",
  navyLight: "#163C7E",
  sky: "#1FA9F0",
  skyBright: "#2EC4FF",
  green: "#4FD89C",
  text: "#E8F4F8",
  textMuted: "#92BCE0",
  ripple: "#1FA9F0",
  wave: "#4FD89C",
  chipBg: "rgba(255, 255, 255, 0.96)",
  chipText: "#0A2552",
  chipBorder: "rgba(10, 37, 82, 0.12)",
  photoBorder: "rgba(255, 255, 255, 0.92)",
  divider: "rgba(255, 255, 255, 0.14)",
  /** Full share watermark (non‑Pro) — transparent; legibility via text shadow in ShareWatermark. */
  watermarkBg: "transparent",
  watermarkBorder: "rgba(79, 216, 156, 0.45)",
} as const;

/** Brand-gradient backdrops for share posters (from the app-icon palette). */
export const SHARE_POSTER_GRADIENT = {
  colors: [SHARE_COLORS.skyBright, SHARE_COLORS.sky, SHARE_COLORS.navyLight, SHARE_COLORS.navy] as const,
  locations: [0, 0.32, 0.68, 1] as const,
  start: { x: 0, y: 0 } as const,
  end: { x: 1, y: 1 } as const,
};

export type ShareLayoutTokens = ReturnType<typeof shareLayoutTokens>;

/** Scale every measurement from the 1080×1080 artboard spec. */
export function shareLayoutTokens(side: number) {
  const t = Math.max(1, side) / SHARE_DESIGN_SIZE;
  const r = (n: number) => Math.round(n * t);
  const inner = Math.max(1, side - r(64) * 2);
  const logoMark = r(120);
  const logoRendered = logoMark * 2;

  return {
    side,
    pad: r(64),
    inner,
    gapXs: r(8),
    gapSm: r(12),
    gapMd: r(20),
    gapLg: r(28),
    radiusOuter: r(32),
    radiusPhoto: r(24),
    radiusChip: r(999),
    radiusWatermark: r(20),
    titleSize: r(40),
    titleIcon: r(34),
    titleGlyph: r(28),
    titleTracking: -0.8 * t,
    dividerH: Math.max(1, r(2)),
    chipFont: r(24),
    chipEmoji: r(26),
    chipThemeFont: r(28),
    chipThemeEmoji: r(30),
    chipThemePadV: r(14),
    chipThemeMinH: r(48),
    chipGap: r(10),
    chipPadH: r(18),
    chipPadV: r(10),
    chipMinH: r(44),
    chipBorder: Math.max(1, r(1.5)),
    photoGap: r(14),
    photoBorder: Math.max(2, r(3)),
    photoSize: Math.round((inner - r(14)) / 2),
    photoScrimH: r(72),
    flagOnPhoto: r(28),
    countryOnPhoto: r(20),
    countryOnPhotoHi: r(22),
    logoMark,
    logoRendered,
    flagBadge: r(52),
    flagEmoji: r(30),
    countryFont: r(22),
    countryFontHi: r(24),
    watermarkPadV: r(18),
    watermarkPadH: r(30),
    watermarkIcon: r(34),
    watermarkTitle: r(26),
    watermarkSub: r(18),
    watermarkBorder: Math.max(1.5, r(2.5)),
    mapRadius: r(16),
    mapHeightRatio: 0.34,
    thumbSize: r(148),
    thumbBorder: Math.max(2, r(3)),
    thumbFlag: r(36),
    dotSize: r(8),
    brandFooterFont: r(20),
    brandFooterIcon: r(22),
  };
}

function shareFooterHeight(
  L: ShareLayoutTokens,
  showWatermark: boolean,
): number {
  return showWatermark
    ? L.watermarkPadV * 2 + L.watermarkTitle + L.watermarkSub + L.gapXs
    : L.brandFooterFont + L.gapXs;
}

/** Header row (logo + title + topic) → divider → meta chip row. */
function shareTopBandHeight(L: ShareLayoutTokens): number {
  const headerH = Math.max(
    L.logoRendered,
    L.chipThemeMinH,
    Math.round(L.titleSize * 1.12),
  );
  const metaRowH = L.chipMinH;
  const dividerBlockH = L.dividerH;
  return headerH + L.gapXs + dividerBlockH + L.gapXs + metaRowH;
}

/** Tighter tokens for share posters (more room for hero content). */
function shareCompactTokens(L: ShareLayoutTokens) {
  return {
    ...L,
    titleSize: Math.max(12, Math.round(L.titleSize * 0.88)),
    titleGlyph: Math.max(10, Math.round(L.titleGlyph * 0.88)),
    chipFont: Math.round(L.chipFont * 0.9),
    chipEmoji: Math.round(L.chipEmoji * 0.9),
    chipThemeFont: Math.round(L.chipThemeFont * 0.9),
    chipThemeEmoji: Math.round(L.chipThemeEmoji * 0.9),
    chipPadV: Math.round(L.chipPadV * 0.88),
    chipThemePadV: Math.round(L.chipThemePadV * 0.88),
    chipMinH: Math.round(L.chipMinH * 0.9),
    chipThemeMinH: Math.round(L.chipThemeMinH * 0.9),
    logoMark: Math.round(L.logoMark * 0.92),
    logoRendered: Math.round(L.logoRendered * 0.92),
  };
}

/** Photo-card layout: maximise hero photos inside a strict square. */
export function sharePhotoCardLayout(
  side: number,
  opts: { showWatermark: boolean },
) {
  const base = shareLayoutTokens(side);
  const pad = Math.round(base.pad * 0.58);
  const inner = Math.max(1, side - pad * 2);
  const contentH = side - pad * 2;
  const L = shareCompactTokens({ ...base, inner, pad });

  const topBandH = shareTopBandHeight(L);
  const footerH = shareFooterHeight(L, opts.showWatermark);
  const chrome = topBandH + footerH + L.gapXs + L.gapSm;

  const photoFromWidth = Math.floor((inner - L.photoGap) / 2);
  const photoFromHeight = Math.max(48, Math.floor(contentH - chrome));
  const photoSize = Math.min(photoFromWidth, photoFromHeight);

  return {
    ...L,
    pad,
    inner,
    photoSize,
    topBandH,
    photoScrimH: Math.round(L.photoScrimH * 0.92),
    countryOnPhoto: Math.round(L.countryOnPhoto * 0.94),
    countryOnPhotoHi: Math.round(L.countryOnPhotoHi * 0.94),
    flagOnPhoto: Math.round(L.flagOnPhoto * 0.94),
  };
}

/** Atlas map share card: maximise map + thumbs below the divider. */
export function shareAtlasCardLayout(
  side: number,
  opts: { showWatermark: boolean },
) {
  const base = shareLayoutTokens(side);
  const pad = Math.round(base.pad * 0.58);
  const inner = Math.max(1, side - pad * 2);
  const contentH = side - pad * 2;
  const L = shareCompactTokens({ ...base, inner, pad });

  const topBandH = shareTopBandHeight(L);
  const footerH = shareFooterHeight(L, opts.showWatermark);
  const bodyGap = L.gapSm;

  const availBody = Math.max(
    60,
    contentH - topBandH - footerH - L.gapXs - bodyGap,
  );

  const thumbGapTotal = L.gapLg * 2 + L.dotSize * 3 + L.gapXs * 2;
  const thumbMaxW = Math.floor((inner - thumbGapTotal) / 2.15);
  const thumbSize = Math.min(L.thumbSize, thumbMaxW, Math.round(availBody * 0.38));
  const thumbRowH = thumbSize + Math.round(L.thumbFlag * 0.35);

  const mapW = inner;
  let mapH = Math.max(48, availBody - thumbRowH);
  const maxMapH = Math.round(mapW * 0.4);
  const minMapH = Math.round(mapW * 0.26);
  mapH = Math.min(maxMapH, Math.max(minMapH, mapH));

  return {
    ...L,
    pad,
    inner,
    topBandH,
    mapW,
    mapH,
    thumbSize,
    thumbRowH,
  };
}
