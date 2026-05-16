import type { WebBrowserAuthSessionResult } from "expo-web-browser";

export type ParsedOAuthSessionFailure = {
  summary: string;
  errorCode: string | null;
  isInvalidClient: boolean;
  isUserCancelled: boolean;
};

/** Clerk Google SSO failed before a session was created (browser step). */
export function parseOAuthSessionFailure(
  result: WebBrowserAuthSessionResult | null | undefined,
): ParsedOAuthSessionFailure | null {
  if (!result) {
    return {
      summary: "Google sign-in did not return a result from the browser.",
      errorCode: null,
      isInvalidClient: false,
      isUserCancelled: false,
    };
  }

  if (result.type === "cancel") {
    return {
      summary: "Google sign-in was cancelled.",
      errorCode: null,
      isInvalidClient: false,
      isUserCancelled: true,
    };
  }

  const url = "url" in result && typeof result.url === "string" ? result.url : "";
  const params = url ? parseOAuthQuery(url) : null;
  const error = params?.get("error") ?? null;
  const description =
    params?.get("error_description") ?? params?.get("error_message") ?? null;

  if (error || description) {
    const isInvalidClient =
      error === "invalid_client" ||
      /oauth client was not found/i.test(description ?? "") ||
      /invalid_client/i.test(description ?? "");
    return {
      summary: description ?? error ?? "Google OAuth returned an error.",
      errorCode: error,
      isInvalidClient,
      isUserCancelled: false,
    };
  }

  if (result.type === "dismiss" || result.type === "locked") {
    return {
      summary:
        "Google sign-in closed before finishing. If you saw “OAuth client was not found” or “invalid_client”, fix Google Cloud + Clerk (see error details below).",
      errorCode: null,
      isInvalidClient: true,
      isUserCancelled: false,
    };
  }

  if (result.type !== "success" || !url) {
    return {
      summary: `Google sign-in ended (${result.type}) without a session.`,
      errorCode: error,
      isInvalidClient: false,
      isUserCancelled: false,
    };
  }

  return null;
}

function parseOAuthQuery(url: string): URLSearchParams {
  try {
    return new URL(url).searchParams;
  } catch {
    const query = url.includes("?") ? url.split("?")[1]?.split("#")[0] ?? "" : "";
    return new URLSearchParams(query);
  }
}

export function formatGoogleOAuthSetupChecklist(packageName: string): string {
  return [
    "Google “invalid_client” / “OAuth client was not found” fix:",
    "1. Google Cloud Console → APIs & Services → Credentials",
    `2. Create Android OAuth client: package ${packageName}`,
    "   Add SHA-1 + SHA-256 from Play Console → Setup → App signing",
    "   (App signing key certificate, not only upload key)",
    "3. Create Web OAuth client for Clerk:",
    "   Authorized redirect URIs = copy from Clerk Dashboard →",
    "   Configure → Google → Redirect URIs (Clerk shows the list)",
    "4. Clerk Dashboard → Configure → Google → paste Web client ID + secret",
    "5. Enable “Google” social connection and save",
  ].join("\n");
}
