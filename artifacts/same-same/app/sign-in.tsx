import { useSSO } from "@clerk/expo";
/**
 * Email code must use the *legacy* SignIn / SignUp resources.
 * `@clerk/expo`'s default `useSignIn` returns SignInFuture, which has
 * `emailCode.sendCode()` — not `prepareFirstFactor` / `supportedFirstFactors`.
 * Calling the legacy methods on Future threw, and the empty catch made Send
 * look like a silent failure in Expo Go.
 */
import { useSignIn, useSignUp } from "@clerk/expo/legacy";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, TextInput, View } from "react-native";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { apiOrigin, isExpoGo, LEGAL_LINKS } from "@/config/env";
import { clerkErrorCode, clerkErrorMessage } from "@/lib/clerkError";
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
  if (isExpoGo()) {
    return AuthSession.makeRedirectUri({ path: "callback" });
  }
  const scheme =
    (Platform.OS === "ios"
      ? Constants.expoConfig?.ios?.bundleIdentifier
      : Constants.expoConfig?.android?.package) ?? "echo.samewaveripple.app";
  return AuthSession.makeRedirectUri({ scheme, path: "callback", preferLocalhost: false });
}

/** Satisfy Clerk's required-password rule without asking the person for one. */
function ephemeralPassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
  let out = "Sw1!";
  for (let i = 0; i < 24; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)]!;
  }
  return out;
}

type EmailStep = "email" | "code";
type EmailFlow = "signIn" | "signUp";

export default function SignInScreen() {
  const router = useRouter();
  const { startSSOFlow } = useSSO();
  const { isLoaded: signInLoaded, signIn, setActive: setActiveFromSignIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveFromSignUp } = useSignUp();
  const setActive = setActiveFromSignIn ?? setActiveFromSignUp;
  const isLoaded = signInLoaded && signUpLoaded;

  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [emailStep, setEmailStep] = useState<EmailStep>("email");
  const [emailFlow, setEmailFlow] = useState<EmailFlow>("signIn");
  const inExpoGo = isExpoGo();

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
      console.log(
        "[sign-in] OAuth redirectUrl =",
        redirectUrl(),
        "isExpoGo =",
        inExpoGo,
        "expoVersion =",
        Constants.expoVersion,
        "executionEnvironment =",
        Constants.executionEnvironment,
        "appOwnership =",
        Constants.appOwnership,
      );
    }
  }, [inExpoGo]);

  const signInWithGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const oauthRedirect = redirectUrl();
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
          inExpoGo
            ? "Google sign-in didn't return to Expo Go. Use email code below, or ask to allowlist the Expo redirect in Clerk."
            : "Sign-in didn't finish. Please try again.",
        );
      }
    } catch (err) {
      console.warn("[sign-in] Google SSO failed", err);
      setProblem(
        clerkErrorMessage(
          err,
          inExpoGo
            ? "Google sign-in couldn't finish in Expo Go. Try email code below."
            : "We couldn't sign you in just now. Please try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const beginSignUpWithEmailCode = async (identifier: string) => {
    if (!signUp) throw new Error("Sign-up is not ready yet.");
    // This Clerk instance requires a password at sign-up. Email code is still
    // the first factor for sign-in; we mint a one-time password the person
    // never sees so create() succeeds without a dashboard change.
    await signUp.create({
      emailAddress: identifier,
      password: ephemeralPassword(),
    });
    await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
    setEmailFlow("signUp");
    setEmailStep("code");
    setCode("");
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
      console.log("[sign-in] email code: create sign-in for", identifier);
      const created = await signIn.create({ identifier });
      const factor = created.supportedFirstFactors?.find(
        (item) => item.strategy === "email_code" && "emailAddressId" in item,
      ) as { strategy: "email_code"; emailAddressId: string } | undefined;
      if (!factor?.emailAddressId) {
        const strategies =
          created.supportedFirstFactors?.map((item) => item.strategy).join(", ") || "(none)";
        console.warn("[sign-in] email_code factor missing; factors =", strategies);
        setProblem(
          `Email code isn't available for this account (factors: ${strategies}). Try Google on a development build.`,
        );
        return;
      }
      console.log("[sign-in] email code: prepareFirstFactor", factor.emailAddressId);
      await signIn.prepareFirstFactor({
        strategy: "email_code",
        emailAddressId: factor.emailAddressId,
      });
      setEmailFlow("signIn");
      setEmailStep("code");
      setCode("");
    } catch (err) {
      const codeName = clerkErrorCode(err);
      console.warn("[sign-in] email code send failed", codeName, err);
      // Brand-new email → fall through to sign-up + email verification.
      if (
        codeName === "form_identifier_not_found" ||
        codeName === "form_param_nil" ||
        /Couldn't find your account/i.test(clerkErrorMessage(err, ""))
      ) {
        try {
          console.log("[sign-in] falling back to sign-up email_code for", identifier);
          await beginSignUpWithEmailCode(identifier);
          return;
        } catch (signUpErr) {
          console.warn("[sign-in] sign-up email code failed", signUpErr);
          setProblem(
            clerkErrorMessage(
              signUpErr,
              "Couldn't start sign-up for that email. Check it and try again.",
            ),
          );
          return;
        }
      }
      setProblem(clerkErrorMessage(err, "Couldn't send a code to that email. Check it and try again."));
    } finally {
      setBusy(false);
    }
  };

  const verifyEmailCode = async () => {
    if (busy || !isLoaded || !setActive) return;
    const value = code.trim();
    if (value.length < 4) {
      setProblem("Enter the code from your email.");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      if (emailFlow === "signUp") {
        if (!signUp) throw new Error("Sign-up is not ready yet.");
        console.log("[sign-in] verifying sign-up email code");
        const result = await signUp.attemptEmailAddressVerification({ code: value });
        if (result.status === "complete" && result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
          return;
        }
        setProblem(`That code didn't complete sign-up (${result.status}). Try again.`);
        return;
      }
      if (!signIn) throw new Error("Sign-in is not ready yet.");
      console.log("[sign-in] verifying sign-in email code");
      const result = await signIn.attemptFirstFactor({ strategy: "email_code", code: value });
      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        return;
      }
      setProblem(`That code didn't complete sign-in (${result.status}). Try again.`);
    } catch (err) {
      console.warn("[sign-in] email code verify failed", err);
      setProblem(clerkErrorMessage(err, "That code didn't work. Request a new one and try again."));
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

        {inExpoGo ? (
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
                setEmailFlow("signIn");
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
