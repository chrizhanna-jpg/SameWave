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
import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LaunchSplash } from "@/components/LaunchSplash";
import { Waiting } from "@/components/Waiting";
import { findWaveByPhotos } from "@/core/waves";
import { prepareEffects, stopWaveSwoosh } from "@/device/sound";
import { AppStateProvider, useAppState } from "@/state/AppState";
import { SessionProvider, useSession } from "@/state/session";
import { colors, motion } from "@/theme";

/** The splash never stays up longer than this, whatever else is still loading. */
const SPLASH_LIMIT_MS = 4000;
/** Let the launch swoosh settle a little before dismissing when fonts are ready. */
const SPLASH_MIN_MS = 1600;
const FONT_WAIT_MS = 3000;

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Opens the Wave a tapped / foreground notification was about. */
function OpenWaveFromPush() {
  const router = useRouter();
  const { pushTarget, clearPushTarget, waves, sync } = useAppState();

  useEffect(() => {
    if (!pushTarget) return;

    if (pushTarget.waveId) {
      clearPushTarget();
      router.push({
        pathname: "/wave/[id]",
        params: {
          id: pushTarget.waveId,
          ...(pushTarget.reveal ? { reveal: "1" } : {}),
        },
      });
      return;
    }

    const wave =
      pushTarget.photoA && pushTarget.photoB
        ? findWaveByPhotos(waves, pushTarget.photoA, pushTarget.photoB)
        : null;
    if (wave) {
      clearPushTarget();
      router.push({
        pathname: "/wave/[id]",
        params: {
          id: wave.id,
          ...(pushTarget.reveal ? { reveal: "1" } : {}),
        },
      });
    } else if (sync !== "syncing") {
      // Not a Wave notification, or the Wave is not here yet.
      clearPushTarget();
    }
  }, [pushTarget, waves, sync, clearPushTarget, router]);

  return null;
}

/**
 * When a Wave has arrived since the last visit, open the full-screen reveal
 * (circles + sound + photo ceremony). Skips capture/compose/match/wave so it
 * does not interrupt sending or replaying.
 */
function WaveArrivalHost() {
  const router = useRouter();
  const segments = useSegments();
  const { newWaves, markWaveSeen } = useAppState();
  const wave = newWaves[0] ?? null;
  const opened = useRef<string | null>(null);
  const root = segments[0];
  const busy =
    // echo-pair: legacy deep-link path from server push payloads (Wave pair).
    root === "wave" ||
    root === "capture" ||
    root === "compose" ||
    root === "match" ||
    root === "echo-pair";

  useEffect(() => {
    if (!wave || busy) return;
    if (opened.current === wave.id) return;
    opened.current = wave.id;
    markWaveSeen(wave.id);
    router.push({
      pathname: "/wave/[id]",
      params: { id: wave.id, reveal: "1" },
    });
  }, [wave, busy, markWaveSeen, router]);

  return null;
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
          <Stack.Screen name="match" />
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
  const [minSplashDone, setMinSplashDone] = useState(false);
  const [splashForcedOff, setSplashForcedOff] = useState(false);
  const [overlayReady, setOverlayReady] = useState(false);
  const fontsReady = fontsLoaded || fontError !== null || fontWaitOver;
  const splashDone = splashForcedOff || (fontsReady && minSplashDone);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
    prepareEffects();
    const fontTimer = setTimeout(() => setFontWaitOver(true), FONT_WAIT_MS);
    const minTimer = setTimeout(() => setMinSplashDone(true), SPLASH_MIN_MS);
    const splashTimer = setTimeout(() => setSplashForcedOff(true), SPLASH_LIMIT_MS);
    return () => {
      clearTimeout(fontTimer);
      clearTimeout(minTimer);
      clearTimeout(splashTimer);
    };
  }, []);

  // Hide the native splash only after the JS overlay has painted, so the
  // icon + rings hand off without a blank flash.
  useEffect(() => {
    if (!overlayReady) return;
    SplashScreen.hideAsync().catch(() => undefined);
  }, [overlayReady]);

  useEffect(() => {
    if (splashDone) stopWaveSwoosh();
  }, [splashDone]);

  return (
    <SafeAreaProvider style={{ backgroundColor: colors.background }}>
      <StatusBar style="dark" />
      <ErrorBoundary>
        {fontsReady ? (
          <SessionProvider>
            <AppStateProvider>
              <Routes />
            </AppStateProvider>
          </SessionProvider>
        ) : (
          <View style={{ flex: 1, backgroundColor: colors.background }} />
        )}
        {!splashDone ? (
          <LaunchSplash
            playSound
            onLayoutReady={() => setOverlayReady(true)}
          />
        ) : null}
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
