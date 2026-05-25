/**
 * Clerk Frontend API proxy is only for production Clerk instances (pk_live_*).
 * pk_test_* development instances must talk to Clerk directly — proxying via
 * Render returns `host_invalid` and the app never finishes auth bootstrap.
 */
export function isClerkTestPublishableKey(publishableKey: string): boolean {
  return publishableKey.startsWith("pk_test_");
}

/** Decode `pk_test_*` / `pk_live_*` → `instance.clerk.accounts.dev` (no scheme). */
export function clerkFrontendHostFromPublishableKey(
  publishableKey: string,
): string | null {
  const raw = publishableKey.trim().replace(/^pk_(?:test|live)_/, "");
  if (!raw) return null;
  try {
    const padded = raw.padEnd(Math.ceil(raw.length / 4) * 4, "=");
    const decoded = atob(padded).replace(/\$$/, "").trim();
    return decoded.includes(".") ? decoded : null;
  } catch {
    return null;
  }
}

export type ClerkBootstrapProbe = {
  ok: boolean;
  host: string | null;
  status: number | null;
  ms: number;
  error?: string;
  mode: "test" | "live" | "missing" | "unknown";
  proxyUrl: string | null;
};

/** Best-effort reachability check for the Clerk Frontend API (same host the SDK uses on cold start). */
export async function probeClerkBootstrap(
  publishableKey: string,
  apiOrigin: string,
): Promise<ClerkBootstrapProbe> {
  const key = publishableKey.trim();
  const mode = !key
    ? "missing"
    : key.startsWith("pk_live_")
      ? "live"
      : key.startsWith("pk_test_")
        ? "test"
        : "unknown";
  const proxyUrl = resolveClerkProxyUrl(key, apiOrigin) ?? null;
  const host = clerkFrontendHostFromPublishableKey(key);
  if (!host) {
    return {
      ok: false,
      host: null,
      status: null,
      ms: 0,
      error: "invalid or missing publishable key",
      mode,
      proxyUrl,
    };
  }

  const started = Date.now();
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(`https://${host}/v1/environment`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      signal: ctrl.signal,
    });
    return {
      ok: res.ok,
      host,
      status: res.status,
      ms: Date.now() - started,
      error: res.ok ? undefined : `HTTP ${res.status}`,
      mode,
      proxyUrl,
    };
  } catch (err) {
    return {
      ok: false,
      host,
      status: null,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : "fetch failed",
      mode,
      proxyUrl,
    };
  } finally {
    clearTimeout(tid);
  }
}

export type ClerkBootConfig = {
  publishableKey: string;
  proxyUrl: string | undefined;
  keySource: "embedded" | "server" | "server-fallback";
  serverKeyMatched: boolean;
};

export type ApiReachabilityProbe = {
  ok: boolean;
  origin: string;
  status: number | null;
  ms: number;
  error?: string;
};

/** Production: prefer Render `/api/public/clerk-config` when embedded key is missing or stale. */
export async function resolveClerkBootConfig(
  apiOrigin: string,
): Promise<ClerkBootConfig> {
  const embedded = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "";

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    return {
      publishableKey: embedded,
      proxyUrl: resolveClerkProxyUrl(embedded, apiOrigin),
      keySource: "embedded",
      serverKeyMatched: true,
    };
  }

  let publishableKey = embedded;
  let keySource: ClerkBootConfig["keySource"] = embedded
    ? "embedded"
    : "server-fallback";
  let serverKeyMatched = true;

  const origin = apiOrigin.replace(/\/+$/, "");
  if (origin && !origin.includes("__CONFIGURE")) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(`${origin}/api/public/clerk-config`, {
        method: "GET",
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (res.ok) {
        const body = (await res.json()) as { publishableKey?: string | null };
        const serverKey = body.publishableKey?.trim() ?? "";
        if (serverKey) {
          if (!publishableKey) {
            publishableKey = serverKey;
            keySource = "server-fallback";
          } else if (publishableKey !== serverKey) {
            publishableKey = serverKey;
            keySource = "server";
            serverKeyMatched = false;
          }
        }
      }
    } catch {
      /* keep embedded key */
    } finally {
      clearTimeout(tid);
    }
  }

  return {
    publishableKey,
    proxyUrl: resolveClerkProxyUrl(publishableKey, apiOrigin),
    keySource,
    serverKeyMatched,
  };
}

export async function probeApiReachability(
  apiOrigin: string,
): Promise<ApiReachabilityProbe> {
  const origin = apiOrigin.replace(/\/+$/, "");
  const started = Date.now();
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(`${origin}/api/healthz`, {
      method: "GET",
      cache: "no-store",
      signal: ctrl.signal,
    });
    return {
      ok: res.ok,
      origin,
      status: res.status,
      ms: Date.now() - started,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      origin,
      status: null,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : "fetch failed",
    };
  } finally {
    clearTimeout(tid);
  }
}

export function resolveClerkProxyUrl(
  publishableKey: string,
  apiOrigin: string,
): string | undefined {
  if (__DEV__) return undefined;
  if (!publishableKey || isClerkTestPublishableKey(publishableKey)) {
    return undefined;
  }

  const forced = process.env.EXPO_PUBLIC_CLERK_PROXY_URL?.trim();
  if (!forced || forced === "none" || forced === "off") {
    return undefined;
  }
  if (forced) return forced.replace(/\/+$/, "");

  const base = apiOrigin.replace(/\/+$/, "");
  return `${base}/api/__clerk`;
}
