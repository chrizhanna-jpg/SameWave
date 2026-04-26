// Palette tuned to the SameWave app-icon artwork: a vivid royal-blue
// family rather than the previous deep-cool navy. Backgrounds stay
// dark enough for comfortable reading, but every surface now sits in
// the same bright royal-blue range as the icon's backdrop, and the
// primary cyan matches the brighter sky-blue of the icon's "Wave"
// wordmark.
const palette = {
  text: "#E8F4F8",
  tint: "#1FA9F0",

  background: "#0A2552",
  foreground: "#E8F4F8",

  bgElevated: "#0F3068",
  bgElevated2: "#163C7E",

  card: "#133370",
  cardElevated: "#1A4585",
  cardForeground: "#E8F4F8",

  primary: "#1FA9F0",
  primaryForeground: "#FFFFFF",

  secondary: "#163872",
  secondaryForeground: "#92BCE0",

  muted: "#163872",
  mutedForeground: "#92BCE0",

  accent: "#00BFA5",
  accentForeground: "#FFFFFF",

  destructive: "#ef5350",
  destructiveForeground: "#ffffff",

  border: "#1A4585",
  borderSubtle: "rgba(255, 255, 255, 0.06)",
  input: "#1A4585",

  success: "#3DA478",
  successForeground: "#ffffff",

  gold: "#FFD166",
  teal: "#00BFA5",
  coral: "#1FA9F0",
  navy: "#0A2552",
  green: "#3DA478",
};

const radii = { sm: 12, md: 16, lg: 20, xl: 28, pill: 999 } as const;

const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  md: {
    shadowColor: "#000",
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  lg: {
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  glowPrimary: {
    shadowColor: "#1FA9F0",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  glowAccent: {
    shadowColor: "#00BFA5",
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
} as const;

const gradients = {
  primary: ["#1FA9F0", "#00BFA5"] as const,
  warm: ["#FFD166", "#FF9F6A"] as const,
  surface: ["#133370", "#163C7E"] as const,
  surfaceElevated: ["#1A4585", "#133370"] as const,
  hero: ["#163C7E", "#0A2552"] as const,
  challenge: ["#205092", "#133370"] as const,
} as const;

const colors = {
  light: palette,
  radius: 16,
  radii,
  shadows,
  gradients,
};

export default colors;
