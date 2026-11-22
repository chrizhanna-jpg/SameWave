/**
 * OAuth / SSO return path.
 *
 * Production Android redirects to `echo.samewaveripple.app://callback` (and
 * Expo Go / web use AuthSession's `…/callback`). Without this route the deep
 * link lands on `+not-found` ("Nothing here") right after Google sign-in.
 *
 * AuthSession + Clerk's `startSSOFlow` still complete the session; this screen
 * only finishes the browser handoff and sends the person into the normal
 * signed-in gate (starting → home / country).
 */
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useRef } from "react";

import { Waiting } from "@/components/Waiting";
import { useSession } from "@/state/session";

WebBrowser.maybeCompleteAuthSession();

const FALLBACK_MS = 4_000;

export default function OAuthCallbackScreen() {
  const router = useRouter();
  const session = useSession();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;

    if (session.status === "signedIn") {
      sent.current = true;
      // Root layout Protected guards pick starting / country / tabs from here.
      router.replace("/");
      return;
    }

    if (session.status === "signedOut" || session.status === "unavailable") {
      // Brief grace for setActive to land after the browser closes.
      const timer = setTimeout(() => {
        if (sent.current) return;
        sent.current = true;
        router.replace("/sign-in");
      }, FALLBACK_MS);
      return () => clearTimeout(timer);
    }

    return undefined;
  }, [session.status, router]);

  return <Waiting message="Signing you in…" />;
}
