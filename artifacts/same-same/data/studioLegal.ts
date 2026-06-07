/** SameWave Studios — in-app copyright & IP notice (My Path → studio-legal). */

export const STUDIO_NAME = "SameWave Studios";
export const APP_NAME = "SameWave";
export const COPYRIGHT_YEAR = 2026;
export const WAVE_BLUE = "#3A7DFF";

export const SUPPORT_EMAIL = "samewaveripple@gmail.com";

/** Play Console / Data safety — public account deletion request page (no sign-in). */
export const ACCOUNT_DELETION_PAGE_PATH = "/api/account-deletion";

export const DATA_DELETION_REQUEST_SUBJECT = "SameWave data deletion request";

export function accountDeletionPageUrl(apiOrigin: string): string {
  return `${apiOrigin.replace(/\/+$/, "")}${ACCOUNT_DELETION_PAGE_PATH}`;
}

export function accountDeletionMailtoUrl(): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(DATA_DELETION_REQUEST_SUBJECT)}`;
}

export const COPYRIGHT_SHORT = `© ${COPYRIGHT_YEAR} ${STUDIO_NAME} — All rights reserved.`;
export const COPYRIGHT_FOOTER_LABEL = "Copyright:";
export const COPYRIGHT_FOOTER_LINE = COPYRIGHT_SHORT;

export type StudioPublicPolicy = {
  id: string;
  title: string;
  subtitle: string;
  path: string;
};

/** Hosted HTML pages (api-server legal routes). */
export const STUDIO_PUBLIC_POLICIES: StudioPublicPolicy[] = [
  {
    id: "privacy",
    title: "Privacy policy",
    subtitle: "How we collect, use, and protect your data",
    path: "/api/privacy",
  },
  {
    id: "terms",
    title: "Terms of service",
    subtitle: "Rules for using SameWave",
    path: "/api/terms",
  },
  {
    id: "csae",
    title: "Child safety (CSAE)",
    subtitle: "Standards against child sexual abuse and exploitation",
    path: "/api/csae",
  },
  {
    id: "data-deletion",
    title: "Account & data deletion",
    subtitle: "Delete photos in-app or request full account removal",
    path: "/api/data-deletion",
  },
];

export type StudioLegalSection = {
  id: string;
  title: string;
  paragraphs: string[];
};

export const STUDIO_LEGAL_SECTIONS: StudioLegalSection[] = [
  {
    id: "copyright",
    title: "Copyright",
    paragraphs: [
      `© ${COPYRIGHT_YEAR} ${STUDIO_NAME} — All rights reserved.`,
      "All app content, UI design, branding, matching logic, and written material are protected under copyright and applicable intellectual-property laws. Unauthorized copying, distribution, or derivative works are prohibited.",
    ],
  },
  {
    id: "developer",
    title: "Developer",
    paragraphs: [`${STUDIO_NAME}`],
  },
  {
    id: "app",
    title: "App name",
    paragraphs: [APP_NAME],
  },
  {
    id: "logo",
    title: "Logo",
    paragraphs: [
      "A double-wave symbol formed by two parallel curved lines that rise and fall together, subtly creating an “S” shape.",
      "Represents shared wavelength, connection, and resonance. Clean, modern, minimalist style with rounded edges.",
      `Primary colour: Wave Blue (${WAVE_BLUE}), with optional gradient glow for energy and connection.`,
    ],
  },
  {
    id: "concept",
    title: "App idea & concept",
    paragraphs: [
      "SameWave is an anonymous, global connection app where users share a single “moment” (always a picture) and discover others who feel the same.",
      "Users scroll through moments, tap the 🌊 Wave reaction when something resonates, and watch their “Wave Map” light up around the world.",
      "No profiles, no messaging pressure — just instant recognition and shared human experience.",
      "Core features include: posting a moment, reacting with Ripples/Waves, global resonance map, and curated threads of shared emotions and themes.",
    ],
  },
  {
    id: "trade-secret",
    title: "Confidential systems",
    paragraphs: [
      "The matching algorithms, signal-processing methods, and operation of Ripplefire, Wavefire, and related resonance systems are confidential trade secrets of SameWave Studios.",
      "Downloading or using this app does not grant any license to reproduce, reverse engineer, or disclose those systems. Employees, contractors, and collaborators with access are bound by confidentiality obligations.",
    ],
  },
  {
    id: "trademarks",
    title: "Trademarks",
    paragraphs: [
      "SameWave, SameWave Studios, Ripplefire, Wavefire, and associated logos are trademarks or trade dress of SameWave Studios. Third-party names and marks belong to their respective owners.",
    ],
  },
];
