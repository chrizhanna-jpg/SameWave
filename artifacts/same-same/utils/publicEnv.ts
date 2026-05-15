/**
 * Public API origin for fetch() and Clerk proxy derivation.
 *
 * **Development (`__DEV__`):** `EXPO_PUBLIC_DEV_API_URL`, then inferred LAN (Metro host),
 * then emulator loopbacks — all **before** `EXPO_PUBLIC_API_URL`. That stops a stray
 * `EXPO_PUBLIC_API_URL=https://…` clone (meant for production builds) from sending
 * Atlas / analyze / upload traffic to Render while you’re debugging on LAN.
 *
 * **Production builds:** `EXPO_PUBLIC_API_URL` or `EXPO_PUBLIC_DOMAIN` as before.
 *
 * Dev defaults (api-server `PORT=8787`, see `artifacts/api-server/.env.example`):
 * - **Android emulator:** `http://10.0.2.2:8787` — `127.0.0.1` inside the emulator
 *   is the emulated device, not your PC, so `/api/analyze-photo` would never hit the API.
 * - **iOS Simulator / web:** `http://127.0.0.1:8787`
 * - **Physical device (no env):** we derive `http://<metro-host>:8787` from the bundle
 *   `scriptURL` so the phone hits your dev machine on the LAN (same idea as Expo’s host).
 *   If you use **Expo tunnel** / ngrok and inference is skipped, set `EXPO_PUBLIC_DEV_API_URL`
 *   or `adb reverse tcp:8787 tcp:8787` with `http://127.0.0.1:8787`.
 */

import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";

const API_DEV_PORT = 8787;

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Strip path; keep `host:port` or `host` (Expo sometimes omits port). */
function normalizePackagerRef(ref: string): string {
  const s = ref.trim().replace(/^https?:\/\//i, "");
  return s.split("/")[0] ?? s;
}

/** Extract LAN host from `192.168.1.2:8081`-style refs; skip loopback names. */
function parseLanHostFromPackagerRef(ref: string | undefined | null): string | null {
  if (!ref || typeof ref !== "string") return null;
  const t = normalizePackagerRef(ref);
  const bareV4 = /^(\d{1,3}(?:\.\d{1,3}){3})$/.exec(t);
  if (bareV4) {
    const ip = bareV4[1];
    if (ip !== "127.0.0.1" && ip !== "0.0.0.0") return ip;
    return null;
  }
  const ipv4 = /^([\d.]+):(\d+)$/.exec(t);
  if (ipv4) {
    const ip = ipv4[1];
    if (ip !== "127.0.0.1" && ip !== "0.0.0.0") return ip;
    return null;
  }
  const lastColon = t.lastIndexOf(":");
  if (lastColon > 0) {
    const host = t.slice(0, lastColon).replace(/^\[|\]$/g, "");
    if (
      host &&
      host !== "localhost" &&
      host !== "127.0.0.1" &&
      !host.includes(":") &&
      /[a-zA-Z]/.test(host)
    ) {
      return host;
    }
  }
  return null;
}

/**
 * Prefer Expo’s dev manifest fields; in Expo Go, `SourceCode.scriptURL` often stays
 * `http://127.0.0.1:8081/...` on device, which would wrongly send API traffic to the phone.
 */
function inferLanApiOriginFromExpoDev(): string | null {
  try {
    const exCfg = Constants.expoConfig as { hostUri?: string } | null | undefined;
    const fromHostUri = parseLanHostFromPackagerRef(exCfg?.hostUri);
    if (fromHostUri) return `http://${fromHostUri}:${API_DEV_PORT}`;

    const eg = Constants.expoGoConfig as { debuggerHost?: string } | null | undefined;
    const fromDbg = parseLanHostFromPackagerRef(eg?.debuggerHost);
    if (fromDbg) return `http://${fromDbg}:${API_DEV_PORT}`;

    const m2 = Constants.manifest2 as {
      extra?: {
        expoGo?: { debuggerHost?: string };
        expoClient?: { hostUri?: string };
      };
    } | null;
    const fromM2 =
      parseLanHostFromPackagerRef(m2?.extra?.expoClient?.hostUri) ??
      parseLanHostFromPackagerRef(m2?.extra?.expoGo?.debuggerHost);
    if (fromM2) return `http://${fromM2}:${API_DEV_PORT}`;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * When Metro serves the bundle from `http://192.168.x.x:8081/...`, reuse that host
 * for api-server (fallback when manifest fields are missing).
 */
function inferLanApiOriginFromBundleHost(): string | null {
  try {
    const scriptURL = NativeModules.SourceCode?.scriptURL as string | undefined;
    if (!scriptURL || typeof scriptURL !== "string") return null;
    // Tunnel / cloud URLs won’t reach :8787 on the same host — require explicit env.
    if (/exp\.direct|ngrok|expo\.dev/i.test(scriptURL)) return null;
    const m = scriptURL.match(/:\/\/([^/:?]+)/);
    const host = m?.[1];
    if (!host || host === "localhost" || host === "127.0.0.1") return null;
    return `http://${host}:${API_DEV_PORT}`;
  } catch {
    return null;
  }
}

/** `exp://192.168.1.2:8081` / dev-client `exp+…?url=http%3A%2F%2F192.168…%3A8081` — Metro host is often nested. */
function inferLanApiOriginFromExpLinks(): string | null {
  const raw = [
    (Constants as { experienceUrl?: string }).experienceUrl,
    (Constants as { linkingUri?: string }).linkingUri,
  ].filter((s): s is string => typeof s === "string" && s.length > 0);

  const hostFromHttpUrl = (httpish: string): string | null => {
    try {
      const u = new URL(httpish);
      const h = u.hostname;
      if (h && h !== "127.0.0.1" && h !== "localhost") return h;
    } catch {
      /* ignore */
    }
    return null;
  };

  for (const ref of raw) {
    if (/exp\.direct|ngrok/i.test(ref)) continue;

    const nested = ref.match(/[?&]url=([^&]+)/);
    if (nested) {
      try {
        const decoded = decodeURIComponent(nested[1].replace(/\+/g, "%20"));
        const h = hostFromHttpUrl(decoded);
        if (h) return `http://${h}:${API_DEV_PORT}`;
      } catch {
        /* ignore */
      }
    }

    let forUrl = ref
      .replace(/^exp\+[^/]+\/\//i, "http://")
      .replace(/^exp:\/\//i, "http://");
    const q = forUrl.indexOf("?");
    if (q >= 0) forUrl = forUrl.slice(0, q);
    const h = hostFromHttpUrl(forUrl);
    if (h) return `http://${h}:${API_DEV_PORT}`;
  }
  return null;
}

export function getPublicApiOrigin(): string {
  if (__DEV__) {
    const dev = process.env.EXPO_PUBLIC_DEV_API_URL?.trim();
    if (dev) return stripTrailingSlashes(dev);

    const inferred =
      inferLanApiOriginFromExpoDev() ??
      inferLanApiOriginFromBundleHost() ??
      inferLanApiOriginFromExpLinks();

    if (inferred) return stripTrailingSlashes(inferred);

    // Emulator / simulator only — never use these hosts on a physical device.
    if (!Constants.isDevice) {
      const fallback =
        Platform.OS === "android"
          ? "http://10.0.2.2:8787"
          : "http://127.0.0.1:8787";
      return stripTrailingSlashes(fallback);
    }

    // Physical device — no LAN inference (tunnel, etc.).
    const apiUrlFallback = process.env.EXPO_PUBLIC_API_URL?.trim();
    if (apiUrlFallback) return stripTrailingSlashes(apiUrlFallback);

    const domainFallback = process.env.EXPO_PUBLIC_DOMAIN?.trim();
    if (domainFallback) {
      const host = domainFallback.replace(/^https?:\/\//, "").replace(/\/$/, "");
      return stripTrailingSlashes(`https://${host}`);
    }

    console.warn(
      "[SameWave] Set EXPO_PUBLIC_DEV_API_URL=http://<your-pc-lan-ip>:8787 in artifacts/same-same/.env (physical device could not infer Metro host).",
    );
    return stripTrailingSlashes("http://127.0.0.1:8787");
  }

  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (apiUrl) return stripTrailingSlashes(apiUrl);

  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (domain) {
    const host = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return stripTrailingSlashes(`https://${host}`);
  }

  return "https://__CONFIGURE_EXPO_PUBLIC_API_URL_OR_DOMAIN__";
}

/** True when the origin is a loopback / LAN dev api-server (not Render/production). */
export function isLocalDevApiOrigin(origin: string): boolean {
  try {
    const u = new URL(origin.includes("://") ? origin : `http://${origin}`);
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "10.0.2.2") {
      return true;
    }
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Hosted API from env (Render, etc.) — used in dev when LAN api-server lacks OPENAI_API_KEY.
 * Ignores local http://192.168… URLs in EXPO_PUBLIC_API_URL.
 * Optional `EXPO_PUBLIC_HOSTED_API_URL` when both DEV and API_URL point at LAN.
 */
export function getStagedProductionApiOrigin(): string | null {
  const hostedOnly = process.env.EXPO_PUBLIC_HOSTED_API_URL?.trim();
  if (hostedOnly) {
    const normalized = stripTrailingSlashes(hostedOnly);
    if (!isLocalDevApiOrigin(normalized)) return normalized;
  }

  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (apiUrl) {
    const normalized = stripTrailingSlashes(apiUrl);
    if (!isLocalDevApiOrigin(normalized)) return normalized;
  }
  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (domain) {
    const host = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return stripTrailingSlashes(`https://${host}`);
  }
  return null;
}
