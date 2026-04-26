const palette = {
  text: "#E8F4F8",
  tint: "#0288D1",

  background: "#071828",
  foreground: "#E8F4F8",

  bgElevated: "#0a1f38",
  bgElevated2: "#102b4a",

  card: "#0d2340",
  cardElevated: "#143554",
  cardForeground: "#E8F4F8",

  primary: "#0288D1",
  primaryForeground: "#FFFFFF",

  secondary: "#0f2d50",
  secondaryForeground: "#7ba7c2",

  muted: "#0f2d50",
  mutedForeground: "#7ba7c2",

  accent: "#00BFA5",
  accentForeground: "#FFFFFF",

  destructive: "#ef5350",
  destructiveForeground: "#ffffff",

  border: "#143554",
  borderSubtle: "rgba(255, 255, 255, 0.06)",
  input: "#143554",

  success: "#3DA478",
  successForeground: "#ffffff",

  gold: "#FFD166",
  teal: "#00BFA5",
  coral: "#0288D1",
  navy: "#071828",
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
    shadowColor: "#0288D1",
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
  primary: ["#0AA0E8", "#00BFA5"] as const,
  warm: ["#FFD166", "#FF9F6A"] as const,
  surface: ["#0d2340", "#102b4a"] as const,
  surfaceElevated: ["#143554", "#0d2340"] as const,
  hero: ["#102b4a", "#071828"] as const,
  challenge: ["#1a3a5c", "#0d2340"] as const,
} as const;

const colors = {
  light: palette,
  radius: 16,
  radii,
  shadows,
  gradients,
};

export default colors;
