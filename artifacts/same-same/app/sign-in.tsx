// Required Google sign-in screen. The user lands here on first launch
// (and after sign-out) — there is no anonymous mode. We deliberately don't
// show or store the user's Google name / email / photo: the Google account
// is only used as a stable account anchor so photos and country survive
// reinstalls. The legacy device-id is still sent on the first authenticated
// request so the server can link any pre-sign-in photos onto this account.
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useSSO } from "@clerk/expo";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

WebBrowser.maybeCompleteAuthSession();

const COLORS = {
  background: "#071828",
  card: "#0d2340",
  border: "#143554",
  teal: "#00BFA5",
  foreground: "#E8F4F8",
  mutedForeground: "#7ba7c2",
  white: "#FFFFFF",
};

function useWarmUpBrowser(): void {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

export default function SignInScreen() {
  useWarmUpBrowser();
  const insets = useSafeAreaInsets();
  const { startSSOFlow } = useSSO();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPressGoogle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        // Explicit scheme + path. Without `scheme`, makeRedirectUri()
        // falls back to the dev-server URL inside Expo Go (which is the
        // Replit-hosted dev domain), so Google's OAuth callback lands
        // on a web page on that domain instead of bouncing back into
        // the app — the user sees the Replit page flash up and gets
        // ejected from Expo Go. Passing the app scheme makes the
        // redirect resolve to `same-same://sign-in` in production
        // builds, and Expo Go remaps that to its own proxy URL
        // automatically so the same code works in both environments.
        redirectUrl: AuthSession.makeRedirectUri({
          scheme: "same-same",
          path: "sign-in",
        }),
      });
      if (createdSessionId && setActive) {
        await setActive({
          session: createdSessionId,
          navigate: async ({ session }) => {
            if (session?.currentTask) return;
            // Route through "/" (index.tsx) NOT directly to "/(tabs)".
            // The tutorial gate lives in index.tsx — it checks
            // appOpenCount and redirects first-time users to
            // /onboarding. Jumping straight to /(tabs) here would
            // silently skip the tutorial on every fresh sign-in,
            // which is the bug we're fixing.
            router.replace("/");
          },
        });
      } else {
        setError("Sign-in didn't complete. Please try again.");
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't sign in. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, startSSOFlow]);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.heroBlock}>
        <Image
          source={require("@/assets/images/samewave-logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Welcome to SameWave</Text>
        <Text style={styles.subtitle}>
          Sign in once with Google so your photos and country stay with you
          across devices.
        </Text>
      </View>

      <View style={styles.actionBlock}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
          activeOpacity={0.85}
          onPress={onPressGoogle}
          disabled={busy}
          style={[styles.googleBtn, busy && styles.googleBtnBusy]}
        >
          {busy ? (
            <ActivityIndicator color="#3c4043" />
          ) : (
            <>
              <View style={styles.googleMark}>
                <Text style={styles.googleG}>G</Text>
              </View>
              <Text style={styles.googleLabel}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Text style={styles.fineprint}>
          We don't show or store your name, email, or profile photo. Your
          Google account is only used as a private anchor for your data.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  heroBlock: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 12,
  },
  logo: {
    width: 96,
    height: 96,
    marginBottom: 8,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: COLORS.foreground,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: COLORS.mutedForeground,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
  },
  actionBlock: {
    gap: 14,
    paddingBottom: 8,
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: COLORS.white,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 20,
    minHeight: 52,
  },
  googleBtnBusy: { opacity: 0.7 },
  googleMark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dadce0",
    alignItems: "center",
    justifyContent: "center",
  },
  googleG: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#4285F4",
  },
  googleLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#3c4043",
  },
  fineprint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.mutedForeground,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  errorText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "#FF6B6B",
    textAlign: "center",
  },
});
