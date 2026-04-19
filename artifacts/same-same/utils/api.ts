// Base URL for the API server. The Expo app uses the expo-domain router so
// it doesn't share a host with the api-server — we need an absolute URL.
// In development, EXPO_PUBLIC_DOMAIN is set by the dev script and points at
// the workspace's REPLIT_DEV_DOMAIN, which proxies /api → the api-server.
function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) {
    const stripped = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${stripped}`;
  }
  return "";
}

export async function analyzePhoto(input: {
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: string;
}): Promise<string[]> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/analyze-photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { tags?: string[] };
    return Array.isArray(json.tags) ? json.tags : [];
  } catch {
    return [];
  }
}
