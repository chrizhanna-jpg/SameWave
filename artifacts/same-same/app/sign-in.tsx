import { useSSO } from "@clerk/expo";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { apiOrigin, IS_EXPO_GO, LEGAL_LINKS } from "@/config/env";
import { space } from "@/theme";

WebBrowser.maybeCompleteAuthSession();

/**
 * Where Google sends the person back to. It must match the address allowed
 * in the Clerk dashboard, which is the app's package name as the scheme.
 */
function redirectUrl(): string {
  const forced = (process.env.EXPO_PUBLIC_CLERK_SSO_REDIRECT ?? "").trim();
  if (forced) return forced;
  if (Platform.OS === "web") return AuthSession.makeRedirectUri({ path: "callback" });
  const scheme =
    (Platform.OS === "ios"
      ? Constants.expoConfig?.ios?.bundleIdentifier
      : Constants.expoConfig?.android?.package) ?? "echo.samewaveripple.app";
  return AuthSession.makeRedirectUri({ scheme, path: "callback", preferLocalhost: false });
}

export default function SignInScreen() {
  const router = useRouter();
  const { startSSOFlow } = useSSO();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Android opens the sign-in page faster if the browser is already awake.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync().catch(() => undefined);
    return () => {
      void WebBrowser.coolDownAsync().catch(() => undefined);
    };
  }, []);

  const signIn = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: redirectUrl(),
      });
      if (createdSessionId && setActive) {
        // The app moves on by itself once the session is active.
        await setActive({ session: createdSessionId });
      } else {
        setProblem("Sign-in didn't finish. Please try again.");
      }
    } catch {
      setProblem("We couldn't sign you in just now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.top}>
        <BrandMark size={104} withName />
        <Txt tone="secondary" center style={styles.line}>
          Someone, somewhere is having a similar moment.
        </Txt>
      </View>

      <View>
        {problem ? (
          <Txt variant="quiet" tone="ember" center style={styles.problem}>
            {problem}
          </Txt>
        ) : null}
        {IS_EXPO_GO ? (
          <Txt variant="quiet" tone="secondary" center style={styles.problem}>
            Google sign-in can't finish inside Expo Go. Use a development build or the installed app.
          </Txt>
        ) : null}
        <Button label="Continue with Google" onPress={signIn} busy={busy} />
        <Button
          kind="quiet"
          label="How it works"
          onPress={() => router.push("/how-it-works")}
          style={styles.quiet}
        />
        <Txt variant="quiet" tone="secondary" center style={styles.legal}>
          By continuing you agree to the{" "}
          <Txt
            variant="quiet"
            tone="primary"
            accessibilityRole="link"
            onPress={() => void Linking.openURL(apiOrigin() + LEGAL_LINKS.terms)}
          >
            Terms
          </Txt>{" "}
          and{" "}
          <Txt
            variant="quiet"
            tone="primary"
            accessibilityRole="link"
            onPress={() => void Linking.openURL(apiOrigin() + LEGAL_LINKS.privacy)}
          >
            Privacy Policy
          </Txt>
          .
        </Txt>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: "space-between" },
  top: { flex: 1, alignItems: "center", justifyContent: "center" },
  line: { marginTop: space.md, maxWidth: 300 },
  problem: { marginBottom: space.md },
  quiet: { marginTop: space.md },
  legal: { marginTop: space.md },
});
