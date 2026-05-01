import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ClerkLoaded,
  ClerkProvider,
  useAuth,
} from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Redirect, Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { router } from "expo-router";
import { Alert } from "react-native";
import { EchoFlash } from "@/components/EchoFlash";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastHost } from "@/components/ToastHost";
import { AppProvider, useApp } from "@/context/AppContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { setAuthTokenGetter } from "@/utils/api";
import {
  initializeRevenueCat,
  SubscriptionProvider,
  useSubscription,
} from "@/lib/revenuecat";

SplashScreen.preventAutoHideAsync();

// --- Production safety net -------------------------------------------------
// v1.2.1 / v1.2.2 shipped to Play Store and got stuck on the splash screen
// for users on cold start. We never got a clear stack trace because any
// uncaught JS error during boot died silently behind the splash. These two
// nets exist to:
//   (1) Surface ANY uncaught JS error or unhandled promise rejection to the
//       user via Alert, so production crashes are diagnosable instead of
//       invisible ("the app just sits there").
//   (2) Guarantee the splash hides after a hard cap (4 s) regardless of
//       what the bootstrap chain is doing — so a hung font load, a hung
//       Clerk init, or a hung native module can never again leave the user
//       parked on the splash forever. They'll at least see the React tree.
// Both are no-ops in dev (LogBox already shows JS errors) but invaluable
// for diagnosing production-only failures via field reports + screenshots.
type GlobalErrorHandler = (error: Error, isFatal?: boolean) => void;
type ErrorUtilsLike = {
  getGlobalHandler?: () => GlobalErrorHandler | undefined;
  setGlobalHandler?: (handler: GlobalErrorHandler) => void;
};
const errorUtils: ErrorUtilsLike | undefined = (globalThis as unknown as {
  ErrorUtils?: ErrorUtilsLike;
}).ErrorUtils;
if (errorUtils?.setGlobalHandler && errorUtils?.getGlobalHandler) {
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    try {
      Alert.alert(
        isFatal ? "SameWave hit an error" : "Something went wrong",
        `${error?.name ?? "Error"}: ${error?.message ?? "Unknown"}\n\n${(error?.stack ?? "").split("\n").slice(0, 5).join("\n")}`,
      );
    } catch {}
    if (typeof previous === "function") previous(error, isFatal);
  });
}

// Configure the RevenueCat SDK exactly once at module load. Wrapped in
// try/catch so a missing public key (e.g. a misconfigured EAS profile)
// surfaces as a visible alert instead of a white-screen crash.
try {
  initializeRevenueCat();
} catch (err: any) {
  Alert.alert("Billing unavailable", err?.message ?? "Unknown error");
}

const queryClient = new QueryClient();

// Resolve the Clerk publishable key once at module load. We assert it here
// (vs inline) so the rest of the module sees a non-nullable string and the
// app fails loudly instead of silently mounting Clerk with `undefined`.
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing ${name} — check the dev script and eas.json`);
  }
  return v;
}
const CLERK_PUBLISHABLE_KEY: string = requireEnv(
  "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
);

// Wires the API client's bearer-token getter to Clerk's session token.
// This component MUST mount above AppProvider so the getter is in place
// before any of AppProvider's mount-effects fire their first authed
// request — otherwise the very first calls go out without a Bearer and
// 401 against the new clerkMiddleware.
function ClerkTokenBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);
  return null;
}

// Mirror RevenueCat's "pro" entitlement onto the AppContext flag that
// the rest of the app reads from (matches.tsx, reveal.tsx, echo-pair,
// etc. all read `proUnlocked`). This way nothing else has to know
// about the SDK — they just consume the flag, and this bridge keeps
// it in lock-step with the live entitlement (initial load, after a
// purchase, after a restore, after a webhook update).
//
// CRITICAL: only write once the SDK has actually resolved the user's
// CustomerInfo. On cold start `isPro` is `false` simply because we
// haven't heard back from RevenueCat yet — writing that into
// proUnlocked would revoke Pro for paid users until the bootstrap
// completes, and would leave them locked out indefinitely if the
// bootstrap fails (offline, store unreachable). Gating on
// `hasResolvedEntitlements` means an unreachable RevenueCat leaves
// the persisted local flag intact instead of silently flipping it.
function RevenueCatProBridge() {
  const { isPro, hasResolvedEntitlements } = useSubscription();
  const { setProUnlocked } = useApp();
  useEffect(() => {
    if (!hasResolvedEntitlements) return;
    setProUnlocked(isPro);
  }, [isPro, hasResolvedEntitlements, setProUnlocked]);
  return null;
}

// Gates the app behind sign-in for any screen that isn't a pre-auth
// surface (the tutorial / onboarding, the sign-in screen itself, or
// the root index router). The actual decision tree — tutorial first,
// then sign-in, then tabs — lives in `app/index.tsx`; this gate just
// makes sure unauthenticated users can't bypass it via a deep link
// straight into a protected screen, and that signed-in users don't
// stay parked on /sign-in. Renders `null` while resolving auth or
// redirecting so the user never sees a flash of the wrong tree.
function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const segments = useSegments();

  // Cast to a plain string so the comparisons below don't fight
  // expo-router's typed-route inference (it constrains segments[0] to
  // a known union and rejects the empty-string / undefined case).
  const firstSegment = segments[0] as string | undefined;
  const onSignIn = firstSegment === "sign-in";
  // Tutorial is pre-auth: an unauthenticated user is allowed to be on
  // /onboarding so the brand and flow can land before we ask them to
  // sign in. The decision in index.tsx routes them here on first opens.
  const onOnboarding = firstSegment === "onboarding";
  // The root router (no segment, i.e. on "/") is the decision point —
  // never block it; let index.tsx pick the next destination.
  const onRoot = !firstSegment;
  const onPreAuthScreen = onSignIn || onOnboarding || onRoot;

  // Two cases need a redirect through "/" so the central decision in
  // index.tsx runs again with fresh state:
  //  (a) user signed in but is still parked on /sign-in (tutorial may
  //      still be pending — index.tsx handles either case correctly);
  //  (b) user is NOT signed in and is on a protected screen (i.e. not
  //      pre-auth). Bouncing through "/" lets index.tsx decide whether
  //      to send them to /onboarding or /sign-in next.
  //
  // We use a declarative <Redirect> (not an imperative
  // navRouter.replace in a useEffect) because the imperative form
  // races with in-flight navigations — e.g. while the Stack is still
  // settling on /onboarding from index.tsx's <Redirect>, a useEffect
  // here can fire a second REPLACE that the navigator has already
  // moved past, producing a "The action 'REPLACE' with payload
  // {name:'index'} was not handled by any navigator" warning toast on
  // the first onboarding card. <Redirect> is timed by React's render
  // cycle and stays in lock-step with whatever screen is mounting.
  const needsRedirect =
    isLoaded &&
    ((isSignedIn && onSignIn) || (!isSignedIn && !onPreAuthScreen));

  if (!isLoaded) return null;
  if (needsRedirect) return <Redirect href="/" />;
  return <>{children}</>;
}

function RootLayoutNav() {
  // Wire device push registration + tap-to-deep-link. Mounted inside
  // AppProvider so navigation context is available before we call
  // router.push from a notification response.
  usePushNotifications();
  // The echo celebration overlay lives at the root so it can render
  // on top of any tab or modal screen. It picks up newly-mutual echoes
  // detected by AppContext (either via respondToEcho or the polling
  // refresh) and dismisses cleanly without interrupting navigation.
  const { pendingFlashEcho, dismissFlashEcho } = useApp();
  return (
    <>
      <Stack screenOptions={{ headerBackTitle: "Back", headerShown: false }}>
        <Stack.Screen name="sign-in" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="reveal" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="camera" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="echoes" options={{ headerShown: false }} />
        <Stack.Screen name="echo-pair" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="echoes-theme/[theme]" options={{ headerShown: false }} />
        <Stack.Screen name="photo-viewer" options={{ headerShown: false, presentation: "modal" }} />
      </Stack>
      {pendingFlashEcho && (
        <EchoFlash
          myPhotoUri={pendingFlashEcho.mine.uri}
          theirPhotoUri={pendingFlashEcho.theirs.uri}
          myCountryFlag={pendingFlashEcho.mine.countryFlag}
          theirCountry={pendingFlashEcho.theirs.country}
          theirCountryFlag={pendingFlashEcho.theirs.countryFlag}
          themeTitle={pendingFlashEcho.theme}
          onDone={dismissFlashEcho}
          onOpen={() => {
            const a = pendingFlashEcho.mine.id;
            const b = pendingFlashEcho.theirs.id;
            // Push the share-card route FIRST and tear down the flash
            // overlay only after the screen-push transition has had
            // time to cover it. If we dismiss synchronously the
            // overlay disappears immediately, exposing the underlying
            // match screen for the ~300 ms the navigation animation
            // takes — which reads as a flicker back to the match
            // screen before the share card "lands". The timeout
            // matches React Navigation's default stack/modal push
            // duration; the overlay then unmounts behind the new
            // screen, invisible to the user.
            router.push({ pathname: "/echo-pair", params: { a, b } });
            setTimeout(() => dismissFlashEcho(), 400);
          }}
        />
      )}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Safety net: even if useFonts never resolves (we've seen this happen
  // on certain Android builds where the native font loader hangs without
  // throwing), proceed with system fonts after a hard cap so we never
  // sit on the splash forever. 3s is comfortably longer than the
  // observed normal-path font load (~150 ms) and short enough that a
  // user doesn't perceive it as a hang.
  const [fontTimedOut, setFontTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFontTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, []);
  const fontsReady = fontsLoaded || fontError != null || fontTimedOut;

  useEffect(() => {
    if (fontsReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsReady]);

  // Defence in depth: a *second* hard cap (4 s) on hideAsync that fires
  // regardless of where the rest of the bootstrap is. If anything above
  // useFonts has thrown / hung at module load, this still tears down
  // the splash so the user sees the React tree (which can then surface
  // an error via the global handler installed at the top of this file).
  useEffect(() => {
    const t = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  if (!fontsReady) return null;

  // Outermost ErrorBoundary catches errors thrown during ClerkProvider
  // init or anywhere in the tree (the previous placement, inside
  // ClerkProvider > ClerkLoaded, missed any failure in Clerk itself —
  // a likely culprit for the v1.2.1 stuck-on-splash, since ClerkLoaded
  // suspends rendering until Clerk resolves and offers no fallback if
  // it never does).
  return (
    <ErrorBoundary>
      <ClerkProvider
        publishableKey={CLERK_PUBLISHABLE_KEY}
        tokenCache={tokenCache}
      >
        <ClerkLoaded>
          {/* Wire the bearer-token getter BEFORE AppProvider mounts, so
              AppProvider's first authed effects already see a valid token.
              ClerkTokenBridge renders nothing — it's pure side-effect glue. */}
          <ClerkTokenBridge />
          <SafeAreaProvider>
            <QueryClientProvider client={queryClient}>
              <SubscriptionProvider>
                <AppProvider>
                  {/* Keeps AppContext.proUnlocked in sync with the
                      RevenueCat "pro" entitlement. Renders nothing. */}
                  <RevenueCatProBridge />
                  <GestureHandlerRootView style={{ flex: 1 }}>
                    <ToastHost>
                      <AuthGate>
                        <RootLayoutNav />
                      </AuthGate>
                    </ToastHost>
                  </GestureHandlerRootView>
                </AppProvider>
              </SubscriptionProvider>
            </QueryClientProvider>
          </SafeAreaProvider>
        </ClerkLoaded>
      </ClerkProvider>
    </ErrorBoundary>
  );
}
