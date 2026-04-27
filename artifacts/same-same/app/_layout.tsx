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
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { router } from "expo-router";
import { EchoFlash } from "@/components/EchoFlash";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastHost } from "@/components/ToastHost";
import { AppProvider, useApp } from "@/context/AppContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { setAuthTokenGetter } from "@/utils/api";

SplashScreen.preventAutoHideAsync();

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

// Gates the app behind the sign-in screen. Renders `null` (a blank
// branded background, since ClerkProvider sits on top of our dark theme)
// any time we're either still resolving auth or about to redirect, so
// the user never sees a flash of the wrong tree before navigation.
function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const segments = useSegments();
  const navRouter = useRouter();

  const onSignIn = segments[0] === "sign-in";
  const needsRedirect =
    isLoaded && ((!isSignedIn && !onSignIn) || (isSignedIn && onSignIn));

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn && !onSignIn) {
      navRouter.replace("/sign-in");
    } else if (isSignedIn && onSignIn) {
      navRouter.replace("/(tabs)");
    }
  }, [isLoaded, isSignedIn, onSignIn, navRouter]);

  if (!isLoaded || needsRedirect) return null;
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

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
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
          <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
              <AppProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <ToastHost>
                    <AuthGate>
                      <RootLayoutNav />
                    </AuthGate>
                  </ToastHost>
                </GestureHandlerRootView>
              </AppProvider>
            </QueryClientProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
