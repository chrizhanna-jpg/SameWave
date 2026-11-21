import { useAuth, useSignIn, useSSO } from "@clerk/expo";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, TextInput, View } from "react-native";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { apiOrigin, IS_EXPO_GO, LEGAL_LINKS } from "@/config/env";
import { colors, radius, space, type } from "@/theme";

WebBrowser.maybeCompleteAuthSession();

/**
 * Where Google sends the person back after OAuth.
 *
 * In Expo Go we must NOT use the Play package scheme
 * (`echo.samewaveripple.app://…`) — Android hands that to the installed
 * SameWave app. Expo Go gets an `exp://` / `exps://` redirect instead.
 * That URL must also be allowlisted in the Clerk Dashboard (Native
 * applications → Redirect URLs). Production / dev builds keep the package scheme.
 */
function redirectUrl(): string {
  const forced = (process.env.EXPO_PUBLIC_CLERK_SSO_REDIRECT ?? "").trim();
  if (forced) return forced;
  if (Platform.OS === "web") return AuthSession.makeRedirectUri({ path: "callback" });
  if (IS_EXPO_GO) {
    return AuthSession.makeRedirectUri({ path: "callback" });
  }
  const scheme =
    (Platform.OS === "ios"
      ? Constants.expoConfig?.ios?.bundleIdentifier
      : Constants.expoConfig?.android?.package) ?? "echo.samewaveripple.app";
  return AuthSession.makeRedirectUri({ scheme, path: "callback", preferLocalhost: false });
}

type EmailStep = "email" | "code";

export default function SignInScreen() {
  const router = useRouter();
  const { startSSOFlow } = useSSO();
  const { isLoaded, signIn, setActive: setActiveFromSignIn } = useSignIn();
  const { setActive: setActiveFromAuth } = useAuth();
  const setActive = setActiveFromSignIn ?? setActiveFromAuth;

  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [emailStep, setEmailStep] = useState<EmailStep>("email");

  const oauthRedirect = useMemo(() => redirectUrl(), []);

  // Android opens the sign-in page faster if the browser is already awake.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync().catch(() => undefined);
    return () => {
      void WebBrowser.coolDownAsync().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (__DEV__) {
      console.log("[sign-in] OAuth redirectUrl =", oauthRedirect, "IS_EXPO_GO =", IS_EXPO_GO);
    }
  }, [oauthRedirect]);

  const signInWithGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const { createdSessionId, setActive: setActiveFromSso } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: oauthRedirect,
      });
      const activate = setActiveFromSso ?? setActive;
      if (createdSessionId && activate) {
        await activate({ session: createdSessionId });
      } else {
        setProblem(
          IS_EXPO_GO
            ? "Google sign-in didn't return to Expo Go. Use email code below, or ask to allowlist the Expo redirect in Clerk."
            : "Sign-in didn't finish. Please try again.",
        );
      }
    } catch {
      setProblem(
        IS_EXPO_GO
          ? "Google sign-in couldn't finish in Expo Go. Try email code below."
          : "We couldn't sign you in just now. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const sendEmailCode = async () => {
    if (busy || !isLoaded || !signIn) return;
    const identifier = email.trim().toLowerCase();
    if (!identifier.includes("@")) {
      setProblem("Enter the email on your SameWave account.");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const created = await signIn.create({ identifier });
      const factor = created.supportedFirstFactors?.find(
        (item) => item.strategy === "email_code" && "emailAddressId" in item,
      ) as { strategy: "email_code"; emailAddressId: string } | undefined;
      if (!factor?.emailAddressId) {
        setProblem("Email code isn't available for this account. Try Google on a development build.");
        return;
      }
      await signIn.prepareFirstFactor({
        strategy: "email_code",
        emailAddressId: factor.emailAddressId,
      });
      setEmailStep("code");
      setCode("");
    } catch {
      setProblem("Couldn't send a code to that email. Check it and try again.");
    } finally {
      setBusy(false);
    }
  };

  const verifyEmailCode = async () => {
    if (busy || !isLoaded || !signIn || !setActive) return;
    const value = code.trim();
    if (value.length < 4) {
      setProblem("Enter the code from your email.");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const result = await signIn.attemptFirstFactor({ strategy: "email_code", code: value });
      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
      } else {
        setProblem("That code didn't complete sign-in. Try again.");
      }
    } catch {
      setProblem("That code didn't work. Request a new one and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={styles.screen} scroll contentBottomPad={48}>
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
          <Txt variant="quiet" tone="secondary" center style={styles.hint}>
            Expo Go tip: email code avoids the old Play app stealing Google&apos;s redirect. Google
            needs an allowlisted exp:// redirect in Clerk (see Metro log).
          </Txt>
        ) : null}

        <Button label="Continue with Google" onPress={() => void signInWithGoogle()} busy={busy} />

        <Txt variant="quiet" tone="quiet" center style={styles.or}>
          or sign in with email code
        </Txt>

        {emailStep === "email" ? (
          <>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="Email"
              placeholderTextColor={colors.textQuiet}
              style={styles.input}
              editable={!busy}
              accessibilityLabel="Email"
            />
            <Button
              kind="soft"
              label="Send email code"
              onPress={() => void sendEmailCode()}
              busy={busy}
              disabled={!isLoaded}
              style={styles.emailBtn}
            />
          </>
        ) : (
          <>
            <Txt tone="secondary" center style={styles.codeHint}>
              Code sent to {email.trim().toLowerCase()}
            </Txt>
            <TextInput
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              placeholder="6-digit code"
              placeholderTextColor={colors.textQuiet}
              style={styles.input}
              editable={!busy}
              accessibilityLabel="Email code"
            />
            <Button
              kind="soft"
              label="Verify code"
              onPress={() => void verifyEmailCode()}
              busy={busy}
              style={styles.emailBtn}
            />
            <Button
              kind="quiet"
              label="Use a different email"
              onPress={() => {
                setEmailStep("email");
                setCode("");
                setProblem(null);
              }}
              style={styles.quiet}
            />
          </>
        )}

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
  top: { alignItems: "center", justifyContent: "center", paddingTop: space.xl },
  line: { marginTop: space.md, maxWidth: 300 },
  problem: { marginBottom: space.md },
  hint: { marginBottom: space.md, maxWidth: 340, alignSelf: "center" },
  or: { marginTop: space.lg, marginBottom: space.sm },
  input: {
    ...type.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    height: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  emailBtn: { marginTop: space.md },
  codeHint: { marginBottom: space.sm },
  quiet: { marginTop: space.md },
  legal: { marginTop: space.md },
});
