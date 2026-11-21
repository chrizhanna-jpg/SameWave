import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React, { useEffect, useState } from "react";
import { Modal, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Waiting } from "@/components/Waiting";
import { WaveReceived } from "@/components/WaveReceived";
import { findWaveByPhotos } from "@/core/waves";
import { prepareEffects } from "@/device/sound";
import { AppStateProvider, useAppState } from "@/state/AppState";
import { SessionProvider, useSession } from "@/state/session";
import { colors, motion } from "@/theme";

/** The splash never stays up longer than this, whatever else is still loading. */
const SPLASH_LIMIT_MS = 4000;
const FONT_WAIT_MS = 3000;

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Opens the Wave a tapped notification was about, once it has been collected. */
function OpenWaveFromPush() {
  const router = useRouter();
  const { pushTarget, clearPushTarget, waves, sync } = useAppState();

  useEffect(() => {
    if (!pushTarget) return;
    const wave =
      pushTarget.photoA && pushTarget.photoB
        ? findWaveByPhotos(waves, pushTarget.photoA, pushTarget.photoB)
        : null;
    if (wave) {
      clearPushTarget();
      router.push({ pathname: "/wave/[id]", params: { id: wave.id } });
    } else if (sync !== "syncing") {
      // Not a Wave notification, or the Wave is not here yet. The Ripple screen shows what is new.
      clearPushTarget();
    }
  }, [pushTarget, waves, sync, clearPushTarget, router]);

  return null;
}

/**
 * When a Wave has arrived since the last visit, show the full-screen arrival
 * once, mark it seen locally, then open that Wave. Skips capture/compose/wave
 * so it does not interrupt sending or replaying.
 */
function WaveArrivalHost() {
  const router = useRouter();
  const segments = useSegments();
  const { newWaves, markWaveSeen } = useAppState();
  const wave = newWaves[0] ?? null;
  const root = segments[0];
  const busy =
    // echo-pair: legacy deep-link path from server push payloads (Wave pair).
    root === "wave" || root === "capture" || root === "compose" || root === "echo-pair";

  if (!wave || busy) return null;

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" statusBarTranslucent>
      <WaveReceived
        wave={wave}
        onContinue={() => {
          markWaveSeen(wave.id);
          router.push({ pathname: "/wave/[id]", params: { id: wave.id } });
        }}
      />
    </Modal>
  );
}

function Routes() {
  const session = useSession();
  const app = useAppState();

  if (session.status === "unavailable") {
    return (
      <Waiting
        message="Can't reach SameWave"
        detail="Check your connection and try again."
        onRetry={session.retry}
      />
    );
  }
  if (session.status === "loading") {
    return session.slow ? (
      <Waiting
        message="Still connecting…"
        detail="This can take a moment on a slow connection."
        onRetry={session.retry}
      />
    ) : (
      <Waiting />
    );
  }

  // Exactly one of these four is true, so there is always one place to be.
  const signedIn = session.status === "signedIn";
  const starting = signedIn && (!app.ready || app.country === "checking");
  const inApp = signedIn && !starting && app.country === "known";
  const choosingCountry = signedIn && !starting && !inApp;
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "fade",
          animationDuration: motion.fadeQuick,
        }}
      >
        <Stack.Protected guard={inApp}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="capture" />
          <Stack.Screen name="compose" />
          <Stack.Screen name="wave/[id]" />
          <Stack.Screen name="account" />
          <Stack.Screen name="change-country" />
          <Stack.Screen name="echo-pair" />
        </Stack.Protected>
        <Stack.Protected guard={starting}>
          <Stack.Screen name="starting" />
        </Stack.Protected>
        <Stack.Protected guard={choosingCountry}>
          <Stack.Screen name="country" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Screen name="how-it-works" />
        <Stack.Screen name="+not-found" />
      </Stack>
      {inApp ? (
        <>
          <OpenWaveFromPush />
          <WaveArrivalHost />
        </>
      ) : null}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });
  const [fontWaitOver, setFontWaitOver] = useState(false);
  const ready = fontsLoaded || fontError !== null || fontWaitOver;

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
    prepareEffects();
    // If the fonts are slow the app opens in the system font instead of waiting.
    const fontTimer = setTimeout(() => setFontWaitOver(true), FONT_WAIT_MS);
    const splashTimer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => undefined);
    }, SPLASH_LIMIT_MS);
    return () => {
      clearTimeout(fontTimer);
      clearTimeout(splashTimer);
    };
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <SafeAreaProvider style={{ backgroundColor: colors.background }}>
      <StatusBar style="dark" />
      <ErrorBoundary>
        <SessionProvider>
          <AppStateProvider>
            <Routes />
          </AppStateProvider>
        </SessionProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
