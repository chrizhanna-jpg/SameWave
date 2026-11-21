/**
 * The one place the app's look is defined. Screens and components read
 * colours, spacing, corner radius, type and motion timings from here and
 * nowhere else, so the whole app can be retuned in this file.
 *
 * Mood: a still pond at dusk.
 */

export const colors = {
  /** Screen background. */
  pond: "#0B1F33",
  /** Deeper water, used at the bottom of the backdrop and behind photos. */
  pondDeep: "#06131F",
  /** Cards and raised surfaces. */
  pondLift: "#12304A",
  /** Hairlines and quiet outlines. */
  pondEdge: "#21475F",
  /** Main text. */
  mist: "#E6EEF5",
  /** Secondary text. */
  haze: "#8FA8BD",
  /** Faint water highlights: rings, map land, map lines. */
  water: "#7FB4D6",
  /** The single accent. Main button and the word "Wave" only. */
  moon: "#F2D38A",
  /** Text on the accent. */
  moonInk: "#1A2433",
  /** Gentle warning text. */
  ember: "#E8A99C",
  scrim: "rgba(6, 19, 31, 0.72)",
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 72,
} as const;

export const radius = {
  sm: 12,
  md: 20,
  lg: 28,
  pill: 999,
} as const;

export const font = {
  light: "Inter_300Light",
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
} as const;

export const type = {
  /** The word "Wave" in the reveal. */
  hero: { fontFamily: font.light, fontSize: 56, lineHeight: 64, letterSpacing: 1 },
  title: { fontFamily: font.light, fontSize: 32, lineHeight: 40, letterSpacing: 0.2 },
  heading: { fontFamily: font.regular, fontSize: 20, lineHeight: 28 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24 },
  quiet: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  button: { fontFamily: font.medium, fontSize: 17, lineHeight: 22, letterSpacing: 0.2 },
  label: { fontFamily: font.medium, fontSize: 12, lineHeight: 16, letterSpacing: 1.2 },
} as const;

/** All durations are milliseconds. Slow on purpose. */
export const motion = {
  fade: 600,
  fadeQuick: 250,
  /** Reduce Motion replaces every animation with one short fade. */
  reducedFade: 220,
  /** One ring spreading outward. */
  ring: 2400,
  /** Sending a Ripple: rings spread from the tap point. */
  rippleSend: 1800,
  /** Wave reveal, in order. */
  waveBuildUp: 3200,
  waveSplash: 1300,
  waveSharpen: 1500,
  waveHeadlineDelay: 500,
} as const;

export const layout = {
  /** Keeps text lines and buttons readable on tablets and the web. */
  maxContentWidth: 440,
  buttonHeight: 58,
  hitSlop: { top: 12, bottom: 12, left: 12, right: 12 },
} as const;

export const theme = { colors, space, radius, font, type, motion, layout } as const;
export type Theme = typeof theme;
