/**
 * The one place the app's look is defined. Screens and components read
 * colours, spacing, corner radius, type and motion timings from here and
 * nowhere else, so the whole app can be retuned in this file.
 *
 * Mood: soft baby blue — calm water, never clinical white. Photographs and
 * the Wave divider keep their own treatment; chrome stays light and readable.
 */

export const colors = {
  /** App canvas — gentle baby blue, not off-white. */
  background: "#E7F1F8",
  /** Sheets, inputs, quiet pills — a touch deeper baby blue. */
  surface: "#D7EAF4",
  /** Soft translucent baby blue for sheets over photographs. */
  surfaceTranslucent: "rgba(215, 234, 244, 0.92)",

  /** Selected rows, soft fills, map glow — clearer baby blue. */
  waterPale: "#BFDFF0",
  waterSoft: "#9ECFE6",
  /** Primary actions and active marks — richer baby blue, still calm. */
  waterMid: "#6EB4D6",
  waterMuted: "#7A9AAB",

  /** Text. Never pure black — dark slate for contrast on blue. */
  slate: "#3F4A4B",
  textPrimary: "#3F4A4B",
  textSecondary: "#5E6E74",
  textQuiet: "#7E9098",

  /** Hairlines and quiet outlines. */
  line: "rgba(63, 74, 75, 0.14)",
  /**
   * Local scrim behind text over a photograph — stay warm/neutral so photo
   * screens are unchanged in feel.
   */
  overlayLight: "rgba(247, 248, 247, 0.74)",
  overlayDark: "rgba(25, 34, 36, 0.28)",

  white: "#FFFFFF",

  /** Gentle warning text. */
  ember: "#B87A72",

  /**
   * Aliases used by older call sites in this rebuild. Prefer the names above
   * in new code; these keep the screens compiling while the look is mist.
   */
  pond: "#E7F1F8",
  pondDeep: "#D7EAF4",
  pondLift: "#D7EAF4",
  pondEdge: "rgba(63, 74, 75, 0.14)",
  mist: "#3F4A4B",
  haze: "#5E6E74",
  water: "#6EB4D6",
  moon: "#BFDFF0",
  moonInk: "#3F4A4B",
  scrim: "rgba(25, 34, 36, 0.28)",
} as const;

/**
 * The soft join between the two full-screen photographs on a Wave.
 * Warm white so it stays visible over sky and water; never pale blue.
 * Left unchanged when the chrome shifted to baby blue.
 */
export const waveJoin = {
  /** The thin line itself — brief overlayLight. */
  stroke: colors.overlayLight,
  /** A faint soft shadow so the line holds over both bright and dark photos. */
  shadow: "rgba(25, 34, 36, 0.22)",
  /** Line thickness in points. */
  strokeWidth: 1.75,
  shadowWidth: 5,
  /** How far the wave peaks rise into each photo, as a share of screen width. */
  amplitude: 0.045,
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
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const font = {
  light: "Inter_300Light",
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
} as const;

export const type = {
  /** The word "Wave" in the reveal splash. */
  hero: { fontFamily: font.light, fontSize: 42, lineHeight: 50, letterSpacing: 0.4 },
  display: { fontFamily: font.regular, fontSize: 30, lineHeight: 38 },
  title: { fontFamily: font.regular, fontSize: 22, lineHeight: 30 },
  heading: { fontFamily: font.regular, fontSize: 18, lineHeight: 26 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  quiet: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  button: { fontFamily: font.medium, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: font.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  caption: { fontFamily: font.regular, fontSize: 12, lineHeight: 16 },
} as const;

/** All durations are milliseconds. Quiet enough not to demand attention. */
export const motion = {
  fade: 650,
  fadeQuick: 320,
  quick: 180,
  standard: 320,
  slow: 650,
  reveal: 1000,
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
  /** Overlay chrome on photographs hides after this long. */
  chromeHide: 2800,
} as const;

export const layout = {
  /** Keeps text lines and buttons readable on tablets and the web. */
  maxContentWidth: 440,
  buttonHeight: 52,
  iconButtonSize: 44,
  hitSlop: { top: 12, bottom: 12, left: 12, right: 12 },
} as const;

export const theme = { colors, waveJoin, space, radius, font, type, motion, layout } as const;
export type Theme = typeof theme;
