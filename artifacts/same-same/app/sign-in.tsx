// Required Google sign-in screen. The user lands here on first launch
// (and after sign-out) — there is no anonymous mode. We deliberately don't
// show or store the user's Google name / email / photo: the Google account
// is only used as a stable account anchor so photos and country survive
// reinstalls. The legacy device-id is still sent on the first authenticated
// request so the server can link any pre-sign-in photos onto this account.
import * as WebBrowser from "expo-web-browser";
import { useSSO } from "@clerk/expo";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { updateMyCountryCode } from "@/utils/api";
import { parseOAuthSessionFailure } from "@/utils/googleOAuthErrors";
import { getGoogleSsoRedirectUrl } from "@/utils/googleSsoRedirect";
import { postDebugSessionLog } from "@/utils/debugSessionLog";
import {
  formatSignInDiagnosticsLines,
  formatSignInErrorReport,
  getSignInDiagnostics,
  parseSignInError,
  probeClerkKeyMatch,
  SIGN_IN_DIAGNOSTICS_BUILD,
  type ClerkConfigProbe,
} from "@/utils/signInDiagnostics";

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
  const { myCountryCode } = useApp();
  const { startSSOFlow } = useSSO();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clerkProbe, setClerkProbe] = useState<ClerkConfigProbe | null>(null);
  const [probeBusy, setProbeBusy] = useState(false);
  const diagnostics = getSignInDiagnostics();
  const diagnosticLines = formatSignInDiagnosticsLines(diagnostics);

  useEffect(() => {
    void probeClerkKeyMatch().then(setClerkProbe);
  }, []);

  const runClerkProbe = useCallback(async () => {
    setProbeBusy(true);
    try {
      const result = await probeClerkKeyMatch();
      setClerkProbe(result);
      postDebugSessionLog({
        hypothesisId: "H-G-probe",
        location: "sign-in.tsx:runClerkProbe",
        message: "clerk key probe",
        data: {
          ...result,
          redirectUrl: diagnostics.redirectUrlUsed,
          marker: diagnostics.marker,
        },
      });
    } finally {
      setProbeBusy(false);
    }
  }, [diagnostics.marker, diagnostics.redirectUrlUsed]);

  const onPressGoogle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const redirectUrl = getGoogleSsoRedirectUrl();
    try {
      // #region agent log
      postDebugSessionLog({
        hypothesisId: "H-G1",
        location: "sign-in.tsx:onPressGoogle",
        message: "google sso start",
        data: {
          platform: Platform.OS,
          redirectUrl,
        },
      });
      // #endregion
      const { createdSessionId, setActive, authSessionResult } =
        await startSSOFlow({
          strategy: "oauth_google",
          redirectUrl,
        });
      const oauthFailure = parseOAuthSessionFailure(authSessionResult);
      if (createdSessionId && setActive) {
        // Call setActive with only the session param — the `navigate`
        // callback form is a Next.js/web pattern that @clerk/expo does
        // not support in React Native. Navigating via that callback
        // caused an unhandled JS exception after OAuth that triggered
        // Expo's ON_ERROR_RECOVERY update check (and the misleading
        // "Failed to download remote update" error the user sees).
        // Route through "/" so index.tsx lands on tabs when the tutorial
        // is already complete, or on /onboarding only if it is not.
        await setActive({ session: createdSessionId });
        if (myCountryCode) {
          void updateMyCountryCode(myCountryCode);
        }
        // #region agent log
        postDebugSessionLog({
          hypothesisId: "H-Gok",
          location: "sign-in.tsx:onPressGoogle",
          message: "google sso setActive ok",
          data: {},
        });
        // #endregion
        router.replace("/");
      } else {
        const probe = clerkProbe ?? (await probeClerkKeyMatch());
        setClerkProbe(probe);
        setError(
          formatSignInErrorReport({
            err: new Error(
              oauthFailure?.summary ??
                "Google OAuth returned without a session (browser dismissed or callback not received).",
            ),
            diagnostics,
            redirectUrlAttempted: redirectUrl,
            clerkProbe: probe,
            flowStage: "sso_incomplete",
            oauthFailure,
          }),
        );
      }
    } catch (e) {
      const parsed = parseSignInError(e);
      const probe = clerkProbe ?? (await probeClerkKeyMatch());
      setClerkProbe(probe);
      // #region agent log
      postDebugSessionLog({
        hypothesisId: "H-Gerr",
        location: "sign-in.tsx:onPressGoogle",
        message: "google sso caught",
        data: {
          ...parsed,
          redirectUrl,
          marker: diagnostics.marker,
          clerkKeysMatch: probe.keysMatch,
        },
      });
      // #endregion
      setError(
        formatSignInErrorReport({
          err: e,
          diagnostics,
          redirectUrlAttempted: redirectUrl,
          clerkProbe: probe,
          flowStage: "sso_start",
        }),
      );
    } finally {
      setBusy(false);
    }
  }, [busy, clerkProbe, diagnostics, myCountryCode, startSSOFlow]);

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

        {error && (
          <ScrollView
            style={styles.errorScroll}
            nestedScrollEnabled
            accessibilityLabel="Sign-in error details"
          >
            <Text style={styles.errorText} selectable>
              {error}
            </Text>
          </ScrollView>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Test Clerk and API setup"
          activeOpacity={0.85}
          onPress={() => void runClerkProbe()}
          disabled={probeBusy || busy}
          style={styles.probeBtn}
        >
          {probeBusy ? (
            <ActivityIndicator color={COLORS.teal} size="small" />
          ) : (
            <Text style={styles.probeBtnLabel}>Test Clerk setup (no Google)</Text>
          )}
        </TouchableOpacity>

        <View style={styles.diagCard}>
          <Text style={styles.diagTitle}>Closed test build info</Text>
          {diagnosticLines.map((line) => (
            <Text key={line} style={styles.diagLine}>
              {line}
            </Text>
          ))}
          {clerkProbe && (
            <Text
              style={[
                styles.diagLine,
                clerkProbe.keysMatch === false && styles.diagWarn,
                clerkProbe.keysMatch === true && styles.diagOk,
              ]}
            >
              {clerkProbe.ok
                ? clerkProbe.keysMatch
                  ? `Clerk keys match (…${clerkProbe.appKeySuffix})`
                  : `Clerk key mismatch — app …${clerkProbe.appKeySuffix} vs server …${clerkProbe.serverKeySuffix}`
                : `Clerk probe failed: ${clerkProbe.error ?? "unknown"}`}
            </Text>
          )}
          <Text style={styles.diagHint}>
            Need SSO-diag-{SIGN_IN_DIAGNOSTICS_BUILD} on this screen. Play 1.2.8
            can still be an older vc — check vc {diagnostics.versionCodeNative ?? "?"}.
          </Text>
        </View>

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
  errorScroll: {
    maxHeight: 220,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#5c2a2a",
    backgroundColor: "#1a0f14",
    padding: 10,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#FF9B9B",
    textAlign: "left",
    lineHeight: 16,
  },
  probeBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 44,
  },
  probeBtnLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: COLORS.teal,
  },
  diagCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    gap: 4,
  },
  diagTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: COLORS.foreground,
    marginBottom: 4,
  },
  diagLine: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.mutedForeground,
    lineHeight: 16,
  },
  diagHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: COLORS.mutedForeground,
    lineHeight: 15,
    marginTop: 6,
    opacity: 0.85,
  },
  diagOk: { color: COLORS.teal },
  diagWarn: { color: "#FFB347" },
});
