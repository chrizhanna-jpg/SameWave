/**
 * Pure notification payload → route target. Kept free of React Native so
 * unit tests can run under plain node:test.
 */

/** Where a Wave notification should land. */
export interface PushTarget {
  waveId: string | null;
  photoA: string | null;
  photoB: string | null;
  /** Open the full-screen circles + sound + photo ceremony. */
  reveal: boolean;
}

/**
 * Parser for notification `data`. Accepts `waveId` / `echoId`, `/wave/:id`
 * deep links, and legacy `/echo-pair?a=&b=` links.
 */
export function targetFromNotificationData(data: unknown): PushTarget {
  const bag = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const waveIdRaw =
    typeof bag.waveId === "string"
      ? bag.waveId
      : typeof bag.echoId === "string"
        ? bag.echoId
        : null;
  const waveId = waveIdRaw && waveIdRaw.trim() ? waveIdRaw.trim() : null;

  const link = typeof bag.deepLink === "string" ? bag.deepLink : "";
  const path = link.split("?")[0] ?? "";
  const wavePath = path.match(/\/wave\/([^/?#]+)/);
  const fromPath = wavePath?.[1] ? decodeURIComponent(wavePath[1]) : null;

  const query = link.includes("?") ? link.slice(link.indexOf("?") + 1) : "";
  const params = new Map(
    query
      .split("&")
      .map((pair) => pair.split("=") as [string, string | undefined])
      .filter(([key]) => key),
  );
  const read = (key: string) => {
    const value = params.get(key);
    return value ? decodeURIComponent(value) : null;
  };

  // Only mutual / explicit reveal opens the circles+ceremony; pending offers do not.
  const reveal =
    bag.reveal === true ||
    bag.reveal === "1" ||
    bag.state === "mutual" ||
    query.includes("reveal=1");

  return {
    waveId: waveId ?? fromPath,
    photoA: read("a"),
    photoB: read("b"),
    reveal,
  };
}
