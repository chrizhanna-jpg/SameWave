/**
 * Who is using the app. The rest of the app only sees this small shape and
 * never talks to the sign-in service directly.
 *
 * Sign-in goes through Clerk with the same keys as before.
 */
import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { apiOrigin, clerkProxyUrl, clerkPublishableKey } from "@/config/env";
import { uiShotsBuildEnabled } from "@/core/uiShots";
import { withTimeout } from "@/lib/timeout";

export type SessionStatus = "loading" | "signedOut" | "signedIn" | "unavailable";

export interface Session {
  status: SessionStatus;
  /** Stable id for the signed-in account. Local data is filed under it. */
  accountId: string | null;
  /** A short-lived token for the API. `fresh` skips the cached one. */
  getToken(options?: { fresh?: boolean }): Promise<string | null>;
  signOut(): Promise<void>;
  /** True when sign-in is taking unusually long to become ready. */
  slow: boolean;
  /** Starts the sign-in service again after it failed to become ready. */
  retry(): void;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside SessionProvider");
  return session;
}

const SLOW_AFTER_MS = 8000;
const SERVER_KEY_TIMEOUT_MS = 15000;
/** Clerk's getToken can hang after setActive in Expo Go; never block the boot gate on it. */
const TOKEN_TIMEOUT_MS = 12_000;

/**
 * In a store build the server is the authority on which Clerk key is live.
 * The key built into the app is used straight away, and replaced only if the
 * server reports a different one.
 */
async function serverPublishableKey(): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SERVER_KEY_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiOrigin()}/api/public/clerk-config`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { publishableKey?: unknown };
    return typeof body.publishableKey === "string" && body.publishableKey.trim()
      ? body.publishableKey.trim()
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function ClerkBridge({
  children,
  retry,
}: {
  children: React.ReactNode;
  retry: () => void;
}) {
  const auth = useAuth();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (auth.isLoaded) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [auth.isLoaded]);

  // Clerk hands out new function identities on every render; the app needs stable ones.
  const authRef = useRef(auth);
  authRef.current = auth;

  const getToken = useCallback(async (options?: { fresh?: boolean }) => {
    try {
      return await withTimeout(
        authRef.current.getToken({ skipCache: options?.fresh === true }),
        TOKEN_TIMEOUT_MS,
        "Session token timed out",
      );
    } catch (error) {
      if (__DEV__) console.warn("[session] getToken failed", error);
      return null;
    }
  }, []);

  const signOut = useCallback(async () => {
    await authRef.current.signOut();
  }, []);

  const status: SessionStatus = !auth.isLoaded
    ? "loading"
    : auth.isSignedIn
      ? "signedIn"
      : "signedOut";
  const accountId = auth.isLoaded && auth.isSignedIn ? (auth.userId ?? null) : null;

  const session = useMemo<Session>(
    () => ({ status, accountId, getToken, signOut, slow, retry }),
    [status, accountId, getToken, signOut, slow, retry],
  );

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

function ClerkSessionProvider({ children }: { children: React.ReactNode }) {
  const [publishableKey, setPublishableKey] = useState(clerkPublishableKey);
  const [attempt, setAttempt] = useState(0);
  const [lookedUp, setLookedUp] = useState(__DEV__);

  useEffect(() => {
    if (__DEV__) return;
    let cancelled = false;
    void serverPublishableKey().then((key) => {
      if (cancelled) return;
      if (key) setPublishableKey((current) => (current === key ? current : key));
      setLookedUp(true);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setLookedUp(__DEV__);
    setAttempt((n) => n + 1);
  }, []);

  const missing = useMemo<Session>(
    () => ({
      status: lookedUp ? "unavailable" : "loading",
      accountId: null,
      getToken: async () => null,
      signOut: async () => undefined,
      slow: false,
      retry,
    }),
    [lookedUp, retry],
  );

  if (!publishableKey) {
    return <SessionContext.Provider value={missing}>{children}</SessionContext.Provider>;
  }

  return (
    <ClerkProvider
      key={`${attempt}:${publishableKey}`}
      publishableKey={publishableKey}
      tokenCache={tokenCache}
      proxyUrl={clerkProxyUrl(publishableKey)}
    >
      <ClerkBridge retry={retry}>{children}</ClerkBridge>
    </ClerkProvider>
  );
}

/** Preview UI-shot builds can skip Clerk so headless screenshots stay offline-able. */
function UiShotSessionProvider({ children }: { children: React.ReactNode }) {
  const session = useMemo<Session>(
    () => ({
      status: "signedIn",
      accountId: "ui-shot",
      getToken: async () => null,
      signOut: async () => undefined,
      slow: false,
      retry: () => undefined,
    }),
    [],
  );
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // Compile-time: __DEV__ is false in production/EAS — bypass never ships hot.
  if (uiShotsBuildEnabled()) {
    return <UiShotSessionProvider>{children}</UiShotSessionProvider>;
  }
  return <ClerkSessionProvider>{children}</ClerkSessionProvider>;
}
