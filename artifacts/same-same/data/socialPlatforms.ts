export interface SocialPlatform {
  id: string;
  name: string;
  emoji: string;
  prefix: string;
  placeholder: string;
  urlTemplate: (handle: string) => string;
}

const stripHandle = (raw: string) => raw.trim().replace(/^@+/, "");

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  {
    id: "instagram",
    name: "Instagram",
    emoji: "📸",
    prefix: "@",
    placeholder: "yourhandle",
    urlTemplate: (h) => `https://instagram.com/${stripHandle(h)}`,
  },
  {
    id: "facebook",
    name: "Facebook",
    emoji: "📘",
    prefix: "@",
    placeholder: "your.name",
    urlTemplate: (h) => `https://www.facebook.com/${stripHandle(h)}`,
  },
  {
    id: "tiktok",
    name: "TikTok",
    emoji: "🎵",
    prefix: "@",
    placeholder: "yourhandle",
    urlTemplate: (h) => `https://www.tiktok.com/@${stripHandle(h)}`,
  },
  {
    id: "snapchat",
    name: "Snapchat",
    emoji: "👻",
    prefix: "@",
    placeholder: "yourhandle",
    urlTemplate: (h) => `https://snapchat.com/add/${stripHandle(h)}`,
  },
  {
    id: "x",
    name: "X",
    emoji: "✖️",
    prefix: "@",
    placeholder: "yourhandle",
    urlTemplate: (h) => `https://x.com/${stripHandle(h)}`,
  },
  {
    id: "threads",
    name: "Threads",
    emoji: "🧵",
    prefix: "@",
    placeholder: "yourhandle",
    urlTemplate: (h) => `https://www.threads.net/@${stripHandle(h)}`,
  },
  {
    id: "bereal",
    name: "BeReal",
    emoji: "📷",
    prefix: "@",
    placeholder: "yourhandle",
    urlTemplate: (h) => `https://bere.al/${stripHandle(h)}`,
  },
];

export const PLATFORM_BY_ID: Record<string, SocialPlatform> = Object.fromEntries(
  SOCIAL_PLATFORMS.map((p) => [p.id, p]),
);

export function getPlatform(id?: string): SocialPlatform | undefined {
  if (!id) return undefined;
  return PLATFORM_BY_ID[id];
}

export function formatHandle(platformId?: string, handle?: string): string {
  if (!platformId || !handle) return "";
  const p = PLATFORM_BY_ID[platformId];
  if (!p) return handle;
  return `${p.prefix}${stripHandle(handle)}`;
}

export function isValidHandle(raw: string): boolean {
  const h = stripHandle(raw);
  // Permissive: 2-30 chars, letters/numbers/dot/underscore/dash
  return /^[A-Za-z0-9._-]{2,30}$/.test(h);
}
