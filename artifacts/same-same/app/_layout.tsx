import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
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

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

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
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AppProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <ToastHost>
                <RootLayoutNav />
              </ToastHost>
            </GestureHandlerRootView>
          </AppProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
