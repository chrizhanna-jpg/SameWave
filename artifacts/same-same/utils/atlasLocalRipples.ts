import type { Match, MyPhoto } from "@/context/AppContext";
import type { AtlasConnection } from "@/utils/api";
import { photoCountryDisplay, resolveCaptureCountryCode } from "@/utils/photoCountry";

/** ISO2 for Atlas arcs: profile country first, then capture / match snapshots. */
export function resolveViewerIso2(
  myCountryCode: string | undefined,
  matches: Match[],
  myPhotos: MyPhoto[],
): string | undefined {
  const direct = (myCountryCode ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(direct)) return direct;

  const todayUtcDay = Math.floor(Date.now() / 86_400_000);
  const todayPhoto = myPhotos.find((p) => {
    const uploadedUtcDay = Math.floor(
      new Date(p.uploadedAt).getTime() / 86_400_000,
    );
    return uploadedUtcDay === todayUtcDay;
  });
  const fromToday = photoCountryDisplay(todayPhoto?.captureCountryCode).code;
  if (fromToday && /^[A-Z]{2}$/.test(fromToday)) return fromToday;

  const fromCapture = matches.find(
    (m) => m.verdict === "same" && m.myCaptureCountryCode?.trim(),
  )?.myCaptureCountryCode;
  const captureCode = (fromCapture ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(captureCode)) return captureCode;

  return undefined;
}

/** Build device-side ripple arcs from match history (photos may be server URLs or empty). */
export function buildLocalRippleConnections(
  matches: Match[],
  myCountryCode: string | undefined,
  myPhotos: MyPhoto[],
): AtlasConnection[] {
  const mine = resolveViewerIso2(myCountryCode, matches, myPhotos);
  if (!mine) return [];

  const now = Date.now();
  const added: AtlasConnection[] = [];
  for (const m of matches) {
    if (m.verdict !== "same") continue;
    const to = resolveCaptureCountryCode(
      m.theirCaptureCountryCode,
      m.theirPhoto,
    );
    if (!to || to === mine) continue;
    const ts = Date.parse(m.timestamp);
    const fresh = Number.isFinite(ts) && now - ts < 48 * 60 * 60 * 1000;
    const theme = (m.theme ?? "").trim();
    added.push({
      id: `local-ripple-${m.id}`,
      kind: "ripple",
      from: mine,
      to,
      fresh,
      createdAt: m.timestamp,
      theme,
      tags: m.sharedTags ?? m.theirTags ?? [],
      subjects: [],
      color: "#4FD89C",
      mine: true,
      spotlightPhotoId: m.theirPhotoId,
      thumbnailUrl: m.theirPhoto?.startsWith("data:") ? undefined : m.theirPhoto,
    });
  }
  return added;
}

export function mergeAtlasConnectionsById(
  ...groups: AtlasConnection[][]
): AtlasConnection[] {
  const byId = new Map<string, AtlasConnection>();
  for (const group of groups) {
    for (const c of group) {
      const prev = byId.get(c.id);
      if (!prev) {
        byId.set(c.id, c);
        continue;
      }
      byId.set(c.id, {
        ...prev,
        ...c,
        thumbnailUrl: c.thumbnailUrl || prev.thumbnailUrl,
      });
    }
  }
  return [...byId.values()].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}
