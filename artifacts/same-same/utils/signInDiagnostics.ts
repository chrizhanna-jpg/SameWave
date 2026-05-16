/**
 * Closed-test / Play diagnostics for Google SSO + Clerk redirect debugging.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";
import { resolveClerkProxyUrl } from "@/utils/clerkConfig";
import { getPublicApiOrigin } from "@/utils/publicEnv";
import {
  getClerkMobileSsoAllowlistHints,
  getGoogleSsoRedirectUrl,
  SAMEWAVE_ANDROID_PACKAGE,
  SAMEWAVE_APP_SCHEME,
} from "@/utils/googleSsoRedirect";

/** Bump when changing sign-in / SSO diagnostics (visible on sign-in screen). */
export const SIGN_IN_DIAGNOSTICS_BUILD = 30;

export type SignInDiagnostics = {
  marker: string;
  versionName: string;
  versionCodeNative: string | null;
  versionCodeExpo: number | null;
  platform: string;
  androidPackage: string;
  redirectUrlUsed: string;
  forcedRedirectEnv: string | null;
  clerkKeyPrefix: string;
  clerkKeySuffix: string;
  clerkKeyMode: "test" | "live" | "unknown" | "missing";
  clerkProxyUrl: string | null;
  apiOrigin: string;
  allowlistHints: readonly string[];
  expoSchemes: string[];
};

export type ParsedSignInError = {
  summary: string;
  name: string;
  codes: string[];
  clerkTraceId: string | null;
  status: number | null;
  isRedirectMismatch: boolean;
  rawSnippet: string | null;
};

function clerkKeyParts(): {
  prefix: string;
  suffix: string;
  mode: SignInDiagnostics["clerkKeyMode"];
} {
  const key = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "";
  if (!key) return { prefix: "(empty)", suffix: "", mode: "missing" };
  const mode = key.startsWith("pk_live_")
    ? "live"
    : key.startsWith("pk_test_")
      ? "test"
      : "unknown";
  return {
    prefix: key.slice(0, 16),
    suffix: key.length > 24 ? key.slice(-16) : key.slice(16),
    mode,
  };
}

export function getSignInDiagnostics(): SignInDiagnostics {
  const { prefix, suffix, mode } = clerkKeyParts();
  const versionName =
    Constants.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    "?";
  const versionCodeNative =
    Platform.OS === "android" || Platform.OS === "ios"
      ? Constants.nativeBuildVersion ?? null
      : null;
  const vcExpo = Constants.expoConfig?.android?.versionCode;
  const versionCodeExpo =
    typeof vcExpo === "number" ? vcExpo : null;

  const publishableKey =
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "";
  const proxy = resolveClerkProxyUrl(publishableKey, getPublicApiOrigin());
  const forced = process.env.EXPO_PUBLIC_CLERK_SSO_REDIRECT?.trim();
  const schemes = Constants.expoConfig?.scheme;
  const expoSchemes = Array.isArray(schemes)
    ? schemes.map(String)
    : typeof schemes === "string"
      ? [schemes]
      : [];

  return {
    marker: `SSO-diag-${SIGN_IN_DIAGNOSTICS_BUILD}`,
    versionName,
    versionCodeNative,
    versionCodeExpo,
    platform: Platform.OS,
    androidPackage: SAMEWAVE_ANDROID_PACKAGE,
    redirectUrlUsed: getGoogleSsoRedirectUrl(),
    forcedRedirectEnv: forced || null,
    clerkKeyPrefix: prefix,
    clerkKeySuffix: suffix,
    clerkKeyMode: mode,
    clerkProxyUrl: proxy || null,
    apiOrigin: getPublicApiOrigin(),
    allowlistHints: getClerkMobileSsoAllowlistHints(),
    expoSchemes,
  };
}

export function formatSignInDiagnosticsLines(d: SignInDiagnostics): string[] {
  const vc =
    d.versionCodeNative != null
      ? d.versionCodeNative
      : d.versionCodeExpo != null
        ? String(d.versionCodeExpo)
        : "?";
  const lines = [
    `${d.marker} · v${d.versionName} (vc ${vc})`,
    `Redirect sent to Clerk: ${d.redirectUrlUsed}`,
    `Package: ${d.androidPackage}`,
    `Clerk key (${d.clerkKeyMode}): ${d.clerkKeyPrefix}…${d.clerkKeySuffix}`,
    `API: ${d.apiOrigin}`,
  ];
  if (d.forcedRedirectEnv) {
    lines.push(`EXPO_PUBLIC_CLERK_SSO_REDIRECT: ${d.forcedRedirectEnv}`);
  }
  if (d.clerkProxyUrl) {
    lines.push(`Clerk proxy: ${d.clerkProxyUrl}`);
  }
  if (d.expoSchemes.length > 0) {
    lines.push(`Expo schemes: ${d.expoSchemes.join(", ")}`);
  }
  return lines;
}

export type ClerkConfigProbe = {
  ok: boolean;
  appKeySuffix: string;
  serverKeySuffix: string | null;
  keysMatch: boolean | null;
  error?: string;
};

export async function probeClerkKeyMatch(): Promise<ClerkConfigProbe> {
  const appKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "";
  const appKeySuffix =
    appKey.length > 16 ? appKey.slice(-16) : appKey || "(empty)";
  try {
    const res = await fetch(
      `${getPublicApiOrigin()}/api/public/clerk-config`,
      { method: "GET" },
    );
    if (!res.ok) {
      return {
        ok: false,
        appKeySuffix,
        serverKeySuffix: null,
        keysMatch: null,
        error: `HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as { publishableKey?: string | null };
    const serverKey = body.publishableKey?.trim() ?? "";
    const serverKeySuffix = serverKey
      ? serverKey.slice(-16)
      : "(server empty)";
    return {
      ok: true,
      appKeySuffix,
      serverKeySuffix,
      keysMatch:
        appKey.length > 0 && serverKey.length > 0 && appKey === serverKey,
    };
  } catch (e) {
    return {
      ok: false,
      appKeySuffix,
      serverKeySuffix: null,
      keysMatch: null,
      error: e instanceof Error ? e.message : "fetch failed",
    };
  }
}

function safeJsonSnippet(value: unknown, maxLen = 480): string | null {
  try {
    const s = JSON.stringify(value, (_k, v) => {
      if (typeof v === "string" && v.length > 120) {
        return `${v.slice(0, 80)}…(${v.length} chars)`;
      }
      return v;
    });
    if (!s || s === "{}") return null;
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
  } catch {
    return null;
  }
}

/** Pull Clerk API error shape when present on thrown values. */
export function parseSignInError(err: unknown): ParsedSignInError {
  const fallback =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Couldn't sign in. Check your connection and try again.";

  const name = err instanceof Error ? err.name : "Error";
  const codes: string[] = [];
  let clerkTraceId: string | null = null;
  let status: number | null = null;

  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.status === "number") status = o.status;
    if (typeof o.clerkTraceId === "string") clerkTraceId = o.clerkTraceId;
    const errors = o.errors;
    if (Array.isArray(errors)) {
      for (const item of errors) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        if (typeof row.code === "string") codes.push(row.code);
        if (typeof row.longMessage === "string" && row.longMessage.length > 0) {
          return {
            summary: row.longMessage,
            name,
            codes,
            clerkTraceId,
            status,
            isRedirectMismatch:
              /authorized redirect uri/i.test(row.longMessage) ||
              /redirect url.*does not match/i.test(row.longMessage) ||
              /redirect url.*does not match/i.test(fallback),
            rawSnippet: safeJsonSnippet(err),
          };
        }
        if (typeof row.message === "string" && row.message.length > 0) {
          return {
            summary: row.message,
            name,
            codes,
            clerkTraceId,
            status,
            isRedirectMismatch:
              /authorized redirect uri/i.test(row.message) ||
              /redirect url.*does not match/i.test(row.message) ||
              /redirect url.*does not match/i.test(fallback),
            rawSnippet: safeJsonSnippet(err),
          };
        }
      }
    }
  }

  const isRedirectMismatch =
    /authorized redirect uri/i.test(fallback) ||
    /redirect url.*does not match/i.test(fallback);

  return {
    summary: fallback,
    name,
    codes,
    clerkTraceId,
    status,
    isRedirectMismatch,
    rawSnippet: safeJsonSnippet(err),
  };
}

export type SignInErrorReportInput = {
  err: unknown;
  diagnostics: SignInDiagnostics;
  redirectUrlAttempted: string;
  clerkProbe: ClerkConfigProbe | null;
  flowStage: "sso_start" | "sso_incomplete" | "set_active";
};

/**
 * Full support bundle shown on the sign-in screen after any Google SSO failure.
 */
export function formatSignInErrorReport(input: SignInErrorReportInput): string {
  const { err, diagnostics: d, redirectUrlAttempted, clerkProbe, flowStage } =
    input;
  const parsed = parseSignInError(err);
  const vc =
    d.versionCodeNative ??
    (d.versionCodeExpo != null ? String(d.versionCodeExpo) : "?");

  const lines: string[] = [
    "—— Sign-in failed ——",
    "",
    "What happened",
    parsed.summary,
  ];

  if (parsed.codes.length > 0) {
    lines.push(`Clerk codes: ${parsed.codes.join(", ")}`);
  }
  if (parsed.clerkTraceId) {
    lines.push(`Clerk trace: ${parsed.clerkTraceId}`);
  }
  if (parsed.status != null) {
    lines.push(`HTTP status: ${parsed.status}`);
  }
  lines.push(`Error type: ${parsed.name}`);
  lines.push(`Flow stage: ${flowStage}`);

  lines.push("", "—— This build ——");
  lines.push(`Marker: ${d.marker}`);
  lines.push(`Version: ${d.versionName} (native vc ${vc})`);
  lines.push(`Platform: ${d.platform}`);
  lines.push(`Android package: ${d.androidPackage}`);
  if (d.expoSchemes.length > 0) {
    lines.push(`Expo schemes (order matters): ${d.expoSchemes.join(" → ")}`);
  }

  lines.push("", "—— OAuth redirect (must match Clerk allowlist exactly) ——");
  lines.push(`Sent in startSSOFlow: ${redirectUrlAttempted}`);
  if (d.forcedRedirectEnv) {
    lines.push(`From env EXPO_PUBLIC_CLERK_SSO_REDIRECT`);
  }
  lines.push(
    `Computed default (no env): ${getGoogleSsoRedirectUrl() === redirectUrlAttempted ? "same as above" : getGoogleSsoRedirectUrl()}`,
  );

  if (parsed.isRedirectMismatch) {
    lines.push("", "Redirect fix checklist:");
    lines.push(
      "1. Clerk Dashboard → same instance as app pk_ key below",
    );
    lines.push(
      "2. Native applications → Allowlist for mobile SSO redirect",
    );
    lines.push(
      `3. Add this EXACT line if missing: ${redirectUrlAttempted}`,
    );
    lines.push("4. Also add these common variants:");
    for (const hint of d.allowlistHints) {
      lines.push(`   • ${hint}`);
    }
    if (
      redirectUrlAttempted !== `${SAMEWAVE_APP_SCHEME}://` &&
      !d.allowlistHints.includes(`${SAMEWAVE_APP_SCHEME}://`)
    ) {
      lines.push(`   • ${SAMEWAVE_APP_SCHEME}://`);
    }
    lines.push(
      "5. Paths matter: same-same:// ≠ same-same://callback",
    );
  }

  lines.push("", "—— Clerk instance ——");
  lines.push(`App key (${d.clerkKeyMode}): …${d.clerkKeySuffix}`);
  lines.push(`App key prefix: ${d.clerkKeyPrefix}`);
  if (clerkProbe) {
    if (clerkProbe.ok) {
      lines.push(`Server key (Render): …${clerkProbe.serverKeySuffix}`);
      lines.push(
        `App vs server keys: ${
          clerkProbe.keysMatch === true
            ? "MATCH ✓"
            : clerkProbe.keysMatch === false
              ? "MISMATCH ✗ — fix Render CLERK_PUBLISHABLE_KEY or rebuild app"
              : "unknown"
        }`,
      );
    } else {
      lines.push(
        `Server key probe failed: ${clerkProbe.error ?? "unknown"} (${d.apiOrigin}/api/public/clerk-config)`,
      );
    }
  } else {
    lines.push("Server key probe: not run yet (tap Test Clerk setup)");
  }
  if (d.clerkProxyUrl) {
    lines.push(`Clerk proxy: ${d.clerkProxyUrl}`);
  }
  lines.push(`API origin: ${d.apiOrigin}`);

  if (parsed.rawSnippet) {
    lines.push("", "—— Raw error (truncated) ——");
    lines.push(parsed.rawSnippet);
  }

  lines.push("", "Copy this whole message when asking for help.");

  return lines.join("\n");
}
