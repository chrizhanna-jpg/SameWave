import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ClerkProvider,
  useAuth,
} from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Redirect, router, Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { EchoFlash } from "@/components/EchoFlash";
import { formatDualWaveThemes } from "@/utils/shareThemeLabels";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastHost } from "@/components/ToastHost";
import { AppProvider, useApp } from "@/context/AppContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import {
  resetLaunchWarmups,
  setAuthTokenGetter,
  warmClerkOnLaunch,
  warmHostedApiOnLaunch,
} from "@/utils/api";
import {
  probeApiReachability,
  probeClerkBootstrap,
  resolveClerkBootConfig,
  resolveClerkProxyUrl,
  type ApiReachabilityProbe,
  type ClerkBootConfig,
  type ClerkBootstrapProbe,
} from "@/utils/clerkConfig";
import { postDebugSessionLog } from "@/utils/debugSessionLog";
import { getNativeClerkSsoRedirectUrl } from "@/utils/googleSsoRedirect";
import { isMonetizationEnabled } from "@/lib/monetization";
import {
  initializeRevenueCat,
  SubscriptionProvider,
  useSubscription,
} from "@/lib/revenuecat";
import { getPublicApiOrigin } from "@/utils/publicEnv";

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
    console.error(
      "[SameWave uncaught]",
      isFatal ? "(fatal)" : "(non-fatal)",
      error?.message ?? error,
      "\n",
      error?.stack ?? "",
    );
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
if (isMonetizationEnabled()) {
  try {
    initializeRevenueCat();
  } catch (err: any) {
    Alert.alert("Billing unavailable", err?.message ?? "Unknown error");
  }
}

const queryClient = new QueryClient();

// Clerk publishable key — must pair with `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY` on Render.
const EMBEDDED_CLERK_PUBLISHABLE_KEY: string =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "";
if (!EMBEDDED_CLERK_PUBLISHABLE_KEY && __DEV__) {
  console.warn(
    "[SameWave] EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is empty — Clerk sign-in will not work until you set it.",
  );
}

// --- Clerk boot gate (replaces <ClerkLoaded>) ----------------------------
// `<ClerkLoaded>` from @clerk/expo simply returns null until isLoaded is
// true — with no fallback for the case where it NEVER becomes true. That
// is exactly the failure mode that bricked v1.2.5 (TLS handshake hung,
// SDK never resolved, tree never rendered, user saw an indefinite black
// screen). This gate keeps the same "wait for Clerk" semantics on the
// happy path, but if auth bootstrap hasn't completed within a hard
// budget (8 s — generous on cellular cold start, short enough that a
// user won't write the app off as dead) it surfaces a real error screen
// the user can act on, instead of a blank canvas.
//
// 8 s was picked empirically: v1.2.4's normal cold-start Clerk init was
// well under 2 s on mid-tier Android over LTE, so 8 s is ~4× headroom.
// Tune if real-world telemetry shows otherwise.
const CLERK_BOOT_TIMEOUT_MS = 30_000;
const CLERK_BOOT_TIMEOUT_FAST_MS = 12_000;

function ClerkBootGate({
  children,
  onRetry,
  boot,
}: {
  children: React.ReactNode;
  onRetry: () => void;
  boot: ClerkBootConfig;
}) {
  const { isLoaded } = useAuth();
  const [timedOut, setTimedOut] = useState(false);
  const [bootstrapProbe, setBootstrapProbe] = useState<ClerkBootstrapProbe | null>(
    null,
  );
  const [apiProbe, setApiProbe] = useState<ApiReachabilityProbe | null>(null);
  const publishableKey = boot.publishableKey;
  const apiOrigin = getPublicApiOrigin();
  const ssoRedirect = getNativeClerkSsoRedirectUrl();

  useEffect(() => {
    if (__DEV__ || !publishableKey.trim()) return;
    let cancelled = false;
    const origin = apiOrigin;
    void Promise.all([
      probeClerkBootstrap(publishableKey, origin),
      probeApiReachability(origin),
    ]).then(([clerk, api]) => {
      if (!cancelled) {
        setBootstrapProbe(clerk);
        setApiProbe(api);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [publishableKey, apiOrigin]);

  const clerkReachable = bootstrapProbe?.ok === true;
  const bootTimeoutMs =
    bootstrapProbe && !bootstrapProbe.ok
      ? CLERK_BOOT_TIMEOUT_FAST_MS
      : CLERK_BOOT_TIMEOUT_MS;

  // Re-arm whenever Clerk's load state changes OR the retry button
  // resets us back to the loading state. Without `timedOut` in the dep
  // array the timer would only ever fire once, so a Try-Again press
  // would leave the user staring at the spinner forever.
  useEffect(() => {
    if (isLoaded || timedOut) return;
    const t = setTimeout(() => setTimedOut(true), bootTimeoutMs);
    return () => clearTimeout(t);
  }, [isLoaded, timedOut, bootTimeoutMs]);

  if (isLoaded) return <>{children}</>;

  if (!publishableKey.trim()) {
    return (
      <View style={bootGateStyles.root}>
        <Text style={bootGateStyles.title}>Can&apos;t reach SameWave</Text>
        <Text style={bootGateStyles.body}>
          This build is missing the Clerk sign-in key. Rebuild with
          EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY set in eas.json, then upload a new
          version to Play.
        </Text>
      </View>
    );
  }

  if (!timedOut) {
    return (
      <View style={bootGateStyles.loadingRoot}>
        <ActivityIndicator size="large" color="#E8F4F8" />
      </View>
    );
  }

  const clerkLine = bootstrapProbe
    ? bootstrapProbe.ok
      ? `Clerk (${bootstrapProbe.host}): OK ${bootstrapProbe.status} · ${bootstrapProbe.ms}ms`
      : `Clerk (${bootstrapProbe.host ?? "?"}): failed — ${bootstrapProbe.error ?? "unknown"}`
    : "Clerk: still checking…";
  const apiLine = apiProbe
    ? apiProbe.ok
      ? `API (${apiProbe.origin}): OK ${apiProbe.status} · ${apiProbe.ms}ms`
      : `API (${apiProbe.origin}): failed — ${apiProbe.error ?? "unknown"}`
    : "API: still checking…";
  const keyLine = `Clerk key (${boot.keySource}${boot.serverKeyMatched ? "" : ", synced from server"}): ${publishableKey.slice(0, 12)}…`;

  return (
    <View style={bootGateStyles.root}>
      <Text style={bootGateStyles.title}>Can&apos;t reach SameWave</Text>
      <Text style={bootGateStyles.body}>
        The sign-in service did not finish loading (timed out after{" "}
        {bootTimeoutMs / 1000}s).{" "}
        {clerkReachable
          ? "Your network can reach Clerk, so this is usually Play App Signing or Clerk allowlist setup."
          : "Clerk could not be reached from this device — check mobile data, VPN, or DNS."}
      </Text>
      <Text style={bootGateStyles.mono}>{apiLine}</Text>
      <Text style={bootGateStyles.mono}>{clerkLine}</Text>
      <Text style={bootGateStyles.mono}>{keyLine}</Text>
      <Text style={bootGateStyles.body}>
        Play closed-test: add Google Play App Signing SHA-1/256 to your Android
        OAuth client (package{" "}
        <Text style={bootGateStyles.monoInline}>app.echo.samewave</Text>). In
        Clerk → Native applications → allowlist add{" "}
        <Text style={bootGateStyles.monoInline}>{ssoRedirect}</Text> (expected:{" "}
        <Text style={bootGateStyles.monoInline}>app.echo.samewave://callback</Text>
        ).
      </Text>
      <Text style={bootGateStyles.body}>
        Tap Try again. If it keeps failing, send a screenshot of this screen.
      </Text>
      <TouchableOpacity
        style={bootGateStyles.button}
        onPress={() => {
          setTimedOut(false);
          setBootstrapProbe(null);
          onRetry();
        }}
      >
        <Text style={bootGateStyles.buttonLabel}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}
const bootGateStyles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    backgroundColor: "#166FFC",
    justifyContent: "center",
    alignItems: "center",
  },
  root: {
    flex: 1,
    backgroundColor: "#071828",
    paddingHorizontal: 32,
    justifyContent: "center",
    alignItems: "stretch",
  },
  title: {
    color: "#E8F4F8",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 16,
    textAlign: "center",
  },
  body: {
    color: "#7ba7c2",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
    textAlign: "center",
  },
  button: {
    marginTop: 20,
    backgroundColor: "#00BFA5",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonLabel: {
    color: "#071828",
    fontSize: 16,
    fontWeight: "700",
  },
  mono: {
    color: "#9ec5d8",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginBottom: 12,
    textAlign: "center",
  },
  monoInline: {
    color: "#9ec5d8",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});

/** Headless/native Clerk resolves post-auth redirects via `routerReplace`/`routerPush`. */
function normalizeClerkRouterTarget(to: string): string {
  const t = to.trim();
  if (!t) return "/";
  try {
    if (/^https?:\/\//i.test(t)) {
      const u = new URL(t);
      return `${u.pathname || "/"}${u.search}`;
    }
  } catch {
    /* ignore */
  }
  return t.startsWith("/") ? t : `/${t}`;
}

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
    if (!isMonetizationEnabled()) {
      setProUnlocked(true);
      return;
    }
    if (!hasResolvedEntitlements) return;
    setProUnlocked(isPro);
  }, [isPro, hasResolvedEntitlements, setProUnlocked]);
  return null;
}

/** Best-effort Render wake on launch — renders nothing. */
function HostedApiWarmup() {
  useEffect(() => {
    warmHostedApiOnLaunch();
  }, []);
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
      {pendingFlashEcho && (() => {
        const { title: flashThemeTitle, emoji: flashThemeEmoji } =
          formatDualWaveThemes(
            pendingFlashEcho.mine.theme ?? pendingFlashEcho.theme,
            pendingFlashEcho.theirs.theme ?? pendingFlashEcho.theme,
          );
        return (
        <EchoFlash
          myPhotoUri={pendingFlashEcho.mine.uri}
          theirPhotoUri={pendingFlashEcho.theirs.uri}
          myCountryFlag={pendingFlashEcho.mine.countryFlag}
          myCountryCode={pendingFlashEcho.mine.countryCode ?? undefined}
          theirCountry={pendingFlashEcho.theirs.country}
          theirCountryFlag={pendingFlashEcho.theirs.countryFlag}
          theirCountryCode={pendingFlashEcho.theirs.countryCode ?? undefined}
          themeTitle={flashThemeTitle}
          themeEmoji={flashThemeEmoji}
          onDone={dismissFlashEcho}
          onOpen={() => {
            const a = String(pendingFlashEcho.mine.id);
            const b = String(pendingFlashEcho.theirs.id);
            router.push({
              pathname: "/echo-pair",
              params: { a, b, celebrate: "1" },
            });
            setTimeout(() => dismissFlashEcho(), 400);
          }}
        />
        );
      })()}
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

  useEffect(() => {
    if (!__DEV__) warmHostedApiOnLaunch();
  }, []);

  if (!fontsReady) return null;

  return <RootLayoutWithClerk />;
}

// `clerkBootNonce` lets the boot gate's "Try again" button fully
// remount <ClerkProvider> — bumping the nonce changes the React key,
// which tears down the SDK and re-runs initialization from scratch
// (not just a UI reset). Important on flaky networks: a single
// failed cold-start fetch is no longer a death sentence.
//
// Outermost ErrorBoundary catches errors thrown during ClerkProvider
// init or anywhere in the tree (the previous placement, inside
// ClerkProvider > ClerkLoaded, missed any failure in Clerk itself —
// a likely culprit for the v1.2.1 stuck-on-splash, since ClerkLoaded
// suspends rendering until Clerk resolves and offers no fallback if
// it never does).
function RootLayoutWithClerk() {
  const [clerkBootNonce, setClerkBootNonce] = useState(0);
  const [boot, setBoot] = useState<ClerkBootConfig | null>(null);
  const [bootResolving, setBootResolving] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBootResolving(true);
    setBoot(null);
    void resolveClerkBootConfig(getPublicApiOrigin())
      .then((config) => {
        if (cancelled) return;
        if (config.publishableKey.trim()) {
          warmClerkOnLaunch(config.publishableKey);
        }
        setBoot(config);
        setBootResolving(false);
      })
      .catch(() => {
        if (!cancelled) {
          const origin = getPublicApiOrigin();
          const key = EMBEDDED_CLERK_PUBLISHABLE_KEY;
          setBoot({
            publishableKey: key,
            proxyUrl: resolveClerkProxyUrl(key, origin),
            keySource: "embedded",
            serverKeyMatched: true,
          });
          setBootResolving(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clerkBootNonce]);

  const retryClerk = () => {
    resetLaunchWarmups();
    setClerkBootNonce((n) => n + 1);
  };

  if (bootResolving || !boot) {
    return (
      <View style={bootGateStyles.loadingRoot}>
        <ActivityIndicator size="large" color="#E8F4F8" />
      </View>
    );
  }

  if (!boot.publishableKey.trim()) {
    return (
      <View style={bootGateStyles.root}>
        <Text style={bootGateStyles.title}>Can&apos;t reach SameWave</Text>
        <Text style={bootGateStyles.body}>
          This build has no Clerk sign-in key. Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
          in eas.json (and CLERK_PUBLISHABLE_KEY on Render), then rebuild and
          upload a new Play release (versionCode must increase).
        </Text>
        <TouchableOpacity style={bootGateStyles.button} onPress={retryClerk}>
          <Text style={bootGateStyles.buttonLabel}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <ClerkProvider
        key={clerkBootNonce}
        publishableKey={boot.publishableKey}
        tokenCache={tokenCache}
        proxyUrl={boot.proxyUrl}
        signInFallbackRedirectUrl="/"
        signUpFallbackRedirectUrl="/"
        routerReplace={(to) => {
          const path = normalizeClerkRouterTarget(to);
          // #region agent log
          postDebugSessionLog({
            hypothesisId: "H-G-router",
            location: "_layout.tsx:ClerkProvider.routerReplace",
            message: "clerk routerReplace",
            data: { rawLen: to.length, pathLen: path.length },
          });
          // #endregion
          router.replace(path as never);
        }}
        routerPush={(to) => {
          const path = normalizeClerkRouterTarget(to);
          // #region agent log
          postDebugSessionLog({
            hypothesisId: "H-G-router",
            location: "_layout.tsx:ClerkProvider.routerPush",
            message: "clerk routerPush",
            data: { rawLen: to.length, pathLen: path.length },
          });
          // #endregion
          router.push(path as never);
        }}
      >
        <ClerkBootGate boot={boot} onRetry={retryClerk}>
          {/* Wire the bearer-token getter BEFORE AppProvider mounts, so
              AppProvider's first authed effects already see a valid token.
              ClerkTokenBridge renders nothing — it's pure side-effect glue. */}
          <ClerkTokenBridge />
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <QueryClientProvider client={queryClient}>
              <SubscriptionProvider>
                <AppProvider>
                  <HostedApiWarmup />
                  {/* Keeps AppContext.proUnlocked in sync with the
                      RevenueCat "pro" entitlement. Renders nothing. */}
                  <RevenueCatProBridge />
                  <GestureHandlerRootView style={{ flex: 1 }}>
                    <KeyboardProvider>
                      <ToastHost>
                        <AuthGate>
                          <RootLayoutNav />
                        </AuthGate>
                      </ToastHost>
                    </KeyboardProvider>
                  </GestureHandlerRootView>
                </AppProvider>
              </SubscriptionProvider>
            </QueryClientProvider>
          </SafeAreaProvider>
        </ClerkBootGate>
      </ClerkProvider>
    </ErrorBoundary>
  );
}
