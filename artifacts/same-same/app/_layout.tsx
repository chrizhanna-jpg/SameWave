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
import { UpdateAvailableBanner } from "@/components/UpdateAvailableBanner";
import { AppProvider, useApp } from "@/context/AppContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import {
  resetLaunchWarmups,
  setAuthTokenGetter,
  warmClerkOnLaunch,
  warmHostedApiOnLaunch,
} from "@/utils/api";
import {
  resolveClerkBootConfig,
  resolveClerkProxyUrl,
  type ClerkBootConfig,
} from "@/utils/clerkConfig";
import { postDebugSessionLog } from "@/utils/debugSessionLog";
import { isMonetizationEnabled } from "@/lib/monetization";
import {
  initializeRevenueCat,
  SubscriptionProvider,
  useSubscription,
} from "@/lib/revenuecat";
import { getPublicApiOrigin } from "@/utils/publicEnv";
import {
  hideSplashSafe,
  installBootDiagnostics,
  isBootReady,
  markBootReady,
  recordBootError,
  recordBootStep,
  subscribeBootDiagnostics,
  getBootSnapshot,
} from "@/utils/bootDiagnostics";
import { LaunchDiagnosticsView } from "@/components/LaunchDiagnosticsView";

SplashScreen.preventAutoHideAsync();
installBootDiagnostics();
recordBootStep("layout-module");

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
// true — with no fallback for the case where it NEVER becomes true. We
// render the app immediately from local cache instead; AuthGate / index.tsx
// only redirect to sign-in once Clerk reports isLoaded.

function ClerkBootGate({
  children,
  boot,
}: {
  children: React.ReactNode;
  onRetry?: () => void;
  boot: ClerkBootConfig;
}) {
  const publishableKey = boot.publishableKey;

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

  return <>{children}</>;
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
  const { hasHydrated } = useApp();
  const segments = useSegments();

  // Cast to a plain string so the comparisons below don't fight
  // expo-router's typed-route inference (it constrains segments[0] to
  // a known union and rejects the empty-string / undefined case).
  const firstSegment = segments[0] as string | undefined;
  const onSignIn = firstSegment === "sign-in";
  const onOnboarding = firstSegment === "onboarding";
  const onDiagnostics = firstSegment === "diagnostics";
  const onRoot = !firstSegment;
  const onPreAuthScreen = onSignIn || onOnboarding || onRoot || onDiagnostics;

  const needsRedirect =
    isLoaded &&
    !onDiagnostics &&
    ((isSignedIn && onSignIn) || (!isSignedIn && !onPreAuthScreen));

  useEffect(() => {
    if (onDiagnostics) {
      recordBootStep("auth-gate-diagnostics");
      return;
    }
    if (!hasHydrated) return;
    if (needsRedirect) {
      recordBootStep("auth-gate-redirect");
      return;
    }
    markBootReady("auth-gate");
  }, [hasHydrated, needsRedirect, onDiagnostics]);

  if (!hasHydrated && !onDiagnostics) {
    return <HydrationHold />;
  }
  if (needsRedirect) return <Redirect href="/" />;
  return <>{children}</>;
}

/** Visible stand-in while AsyncStorage hydrates — never return a blank tree. */
function HydrationHold() {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    recordBootStep("hydration-hold");
    const t = setTimeout(() => {
      recordBootStep("hydration-timeout", "AsyncStorage hydrate >6s");
      setStuck(true);
    }, 6000);
    return () => clearTimeout(t);
  }, []);
  if (stuck) {
    return (
      <LaunchDiagnosticsView
        onContinue={() => setStuck(false)}
        continueLabel="Hide and keep waiting"
      />
    );
  }
  return (
    <View style={bootGateStyles.loadingRoot}>
      <Text style={bootGateStyles.buttonLabel}>Starting SameWave…</Text>
    </View>
  );
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
      <UpdateAvailableBanner />
      <Stack screenOptions={{ headerBackTitle: "Back", headerShown: false }}>
        <Stack.Screen name="sign-in" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="diagnostics" options={{ headerShown: false }} />
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
          myCaptureCountryCode={pendingFlashEcho.mine.captureCountryCode ?? undefined}
          theirCountry={pendingFlashEcho.theirs.country}
          theirCountryFlag={pendingFlashEcho.theirs.countryFlag}
          theirCountryCode={pendingFlashEcho.theirs.countryCode ?? undefined}
          theirCaptureCountryCode={pendingFlashEcho.theirs.captureCountryCode ?? undefined}
          myPhotoCapturedAt={pendingFlashEcho.mine.capturedAt ?? undefined}
          myPhotoSharedAt={pendingFlashEcho.mine.createdAt ?? undefined}
          theirPhotoCapturedAt={pendingFlashEcho.theirs.capturedAt ?? undefined}
          theirPhotoSharedAt={pendingFlashEcho.theirs.createdAt ?? undefined}
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

function BootWatchdog({ children }: { children: React.ReactNode }) {
  const [stuck, setStuck] = useState(false);
  const [dismissedFatal, setDismissedFatal] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    recordBootStep("boot-watchdog-mount");
    hideSplashSafe();
    const unsub = subscribeBootDiagnostics(() => setTick((n) => n + 1));
    const t = setTimeout(() => {
      if (!isBootReady()) {
        recordBootStep("boot-watchdog-stuck", "no boot-ready after 8s");
        setStuck(true);
      }
    }, 8000);
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, []);

  const fatal =
    getBootSnapshot().lastError?.kind === "fatal" ||
    getBootSnapshot().lastError?.kind === "boundary";
  if ((stuck && !isBootReady()) || (fatal && !dismissedFatal)) {
    return (
      <LaunchDiagnosticsView
        onContinue={() => {
          setStuck(false);
          setDismissedFatal(true);
        }}
        continueLabel="Hide and keep waiting"
      />
    );
  }
  return <>{children}</>;
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
    recordBootStep("root-layout-mount");
    hideSplashSafe();
    const t = setTimeout(() => setFontTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, []);
  const fontsReady = fontsLoaded || fontError != null || fontTimedOut;

  useEffect(() => {
    if (fontsLoaded) recordBootStep("fonts-loaded");
    if (fontError) recordBootStep("fonts-error", fontError.message);
    if (fontTimedOut && !fontsLoaded) recordBootStep("fonts-timeout");
    if (fontsReady) hideSplashSafe();
  }, [fontsReady, fontsLoaded, fontError, fontTimedOut]);

  // Defence in depth: a *second* hard cap (4 s) on hideAsync that fires
  // regardless of where the rest of the bootstrap is.
  useEffect(() => {
    const t = setTimeout(() => hideSplashSafe(), 4000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!__DEV__) warmHostedApiOnLaunch();
    void import("@/utils/imageLoadCache").then((m) => m.hydrateImageCacheIndex());
    void import("@/utils/imageLoadTelemetry").then((m) => m.hydrateImageTelemetry());
    void import("@/utils/sampleAssetPrefetch").then((m) =>
      m.prefetchSampleAssetsOnColdStart(),
    );
  }, []);

  return (
    <BootWatchdog>
      {fontsReady ? (
        <RootLayoutWithClerk />
      ) : (
        <View style={bootGateStyles.loadingRoot}>
          <Text style={bootGateStyles.buttonLabel}>Starting SameWave…</Text>
        </View>
      )}
    </BootWatchdog>
  );
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
function createEmbeddedClerkBoot(): ClerkBootConfig {
  const origin = getPublicApiOrigin();
  const key = EMBEDDED_CLERK_PUBLISHABLE_KEY;
  return {
    publishableKey: key,
    proxyUrl: resolveClerkProxyUrl(key, origin),
    keySource: "embedded",
    serverKeyMatched: true,
  };
}

function RootLayoutWithClerk() {
  const [clerkBootNonce, setClerkBootNonce] = useState(0);
  const [boot, setBoot] = useState<ClerkBootConfig>(createEmbeddedClerkBoot);

  useEffect(() => {
    const key = EMBEDDED_CLERK_PUBLISHABLE_KEY;
    if (key.trim()) warmClerkOnLaunch(key);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void resolveClerkBootConfig(getPublicApiOrigin())
      .then((config) => {
        if (cancelled || !config.publishableKey.trim()) return;
        warmClerkOnLaunch(config.publishableKey);
        setBoot(config);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [clerkBootNonce]);

  const retryClerk = () => {
    resetLaunchWarmups();
    setClerkBootNonce((n) => n + 1);
  };

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
    <ErrorBoundary
      onError={(error, stack) => {
        recordBootError(
          Object.assign(error, { stack: error.stack ?? stack }),
          "boundary",
        );
        hideSplashSafe();
      }}
    >
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
