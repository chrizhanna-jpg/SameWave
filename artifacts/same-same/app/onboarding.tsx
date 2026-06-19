import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { CountryPickerModal } from "@/components/CountryPickerModal";
import { Surface } from "@/components/Surface";
import { GradientCard } from "@/components/GradientCard";
import { PressableScale } from "@/components/PressableScale";
import { Icon } from "@/components/Icon";
import { flagFor, nameFor } from "@/data/countries";
import { detectCountryFromGPS } from "@/utils/gpsCountry";

// Only enforce country selection in production / published builds. In
// dev / Expo Go we keep the legacy "Skip — I'll set it later" behaviour
// so we never have to fight a country picker while testing other
// features. A soft GPS double-check still runs later in the tabs layout
// if the user picked manually and may be traveling — see utils/tabVisits.
const REQUIRE_COUNTRY = !__DEV__;

type GpsCountryHint = "idle" | "loading" | "suggested" | "unavailable";

const { width } = Dimensions.get("window");

type Step = {
  kind: "intro" | "country";
  title: string | null;
  subtitle: string | null;
  body: string | null;
  bodyKind?: "ripple-wave";
};

const STEPS: Step[] = [
  {
    kind: "intro",
    title: null,
    subtitle: null,
    body: "Post your moment right now and see who's on the same wavelength.",
  },
  {
    kind: "intro",
    title: "Send a ripple.",
    subtitle: "Catch a wave.",
    body: null,
    bodyKind: "ripple-wave",
  },
  {
    kind: "country",
    title: "Where are you now?",
    subtitle: null,
    body: "We use this for same-country and same-continent ripples — change it anytime if you're traveling.",
  },
];

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { completeOnboarding, myCountryCode, myCountryName, myCountryFlag, setMyCountry } = useApp();
  const [step, setStep] = React.useState(0);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [gpsHint, setGpsHint] = useState<GpsCountryHint>("idle");

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const globeScale = useRef(new Animated.Value(1)).current;
  const gpsSuggestRanRef = useRef(false);
  const myCountryCodeRef = useRef(myCountryCode);
  myCountryCodeRef.current = myCountryCode;

  const goNext = async () => {
    // In production, the country step is a hard gate — the Continue
    // button no-ops until they've picked one.
    if (isCountryStep && REQUIRE_COUNTRY && !myCountryCode) return;
    if (step < STEPS.length - 1) {
      if (step === 0) {
        Animated.timing(globeScale, {
          toValue: 0.55,
          duration: 450,
          useNativeDriver: true,
        }).start();
      }
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -18,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setStep((s) => s + 1);
        slideAnim.setValue(18);
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 280,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 280,
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else {
      // One atomic persist before "/" — OAuth cold restart only sees AsyncStorage.
      await completeOnboarding(
        myCountryCode && myCountryName && myCountryFlag
          ? { code: myCountryCode, name: myCountryName, flag: myCountryFlag }
          : undefined,
      );
      router.replace("/");
    }
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const isHeroStep = step === 0;
  const currentStep = STEPS[step];
  const isCountryStep = currentStep.kind === "country";
  const continueLocked =
    isCountryStep && REQUIRE_COUNTRY && !myCountryCode;

  useEffect(() => {
    if (!isCountryStep) return;
    if (gpsSuggestRanRef.current) return;
    gpsSuggestRanRef.current = true;

    if (myCountryCodeRef.current) {
      setGpsHint("unavailable");
      return;
    }

    setGpsHint("loading");
    let cancelled = false;
    void detectCountryFromGPS().then((detected) => {
      if (cancelled) return;
      if (myCountryCodeRef.current) {
        setGpsHint("unavailable");
        return;
      }
      if (!detected) {
        setGpsHint("unavailable");
        return;
      }
      const name = detected.name ?? nameFor(detected.code) ?? detected.code;
      const flag = flagFor(detected.code);
      setMyCountry(detected.code, name, flag);
      setGpsHint("suggested");
    });
    return () => {
      cancelled = true;
    };
  }, [isCountryStep, setMyCountry]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.globeWrapper,
          { paddingTop: topPadding + (isHeroStep ? 24 : 12) },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: globeScale }], alignItems: "center" }}>
          {/* Static SameWave brand lockup (matches the app icon exactly).
              The icon image already contains the globe + wordmark + brand
              frame, so we render it directly at two sizes — bigger on the
              hero step, smaller on subsequent steps to leave room for
              the body copy. */}
          <Image
            source={require("@/assets/images/samewave-logo.png")}
            style={{
              width: isHeroStep ? 280 : 160,
              height: isHeroStep ? 280 : 160,
            }}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel="SameWave"
          />
        </Animated.View>
      </View>

      <Animated.View
        style={[
          styles.textSection,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Title/subtitle sit above the body for every step EXCEPT the
            ripple-wave explanation step, where the user explicitly
            asked for the explanation paragraph to come first and the
            "Send a ripple. / Catch a wave." pair to land below it as
            the takeaway flourish. */}
        {currentStep.bodyKind !== "ripple-wave" && currentStep.title && (
          <Text style={[styles.title, { color: colors.foreground }]}>
            {currentStep.title}
          </Text>
        )}
        {currentStep.bodyKind !== "ripple-wave" && currentStep.subtitle && (
          <Text style={[styles.subtitle, { color: colors.primary }]}>
            {currentStep.subtitle}
          </Text>
        )}
        {currentStep.bodyKind === "ripple-wave" ? (
          // Ripple/Wave explanation — three forced lines so the
          // paragraph reads as a balanced three-beat (one phrase per
          // line) instead of reflowing differently on every device
          // width. Icons sit inline at the same baseline as the
          // surrounding text. The split is roughly even by character
          // count to keep the visual block tidy.
          <Text
            style={[
              styles.body,
              styles.bodyRippleWave,
              { color: colors.mutedForeground },
            ]}
            accessibilityLabel="Swipe Ripple on photos that feel like yours. If the other person agrees your two moments were truly alike, they will Ripple back — that's a Wave."
          >
            Swipe Ripple{" "}
            <Icon name="ripple" size={18} color={colors.teal} />
            {" "}on photos{"\n"}
            that feel like yours. If the other person agrees{"\n"}
            your two moments were truly alike, they will Ripple back — that&apos;s a Wave{" "}
            {/* Wave icon (the standalone wave glyph, no wordmark) sits
                inline with the text just like the ripple icon above —
                no transform needed; the icon's natural baseline aligns
                with the surrounding sentence. */}
            <Icon name="wave-glyph" size={22} color={colors.gold} />.
          </Text>
        ) : (
          <Text
            style={[
              styles.body,
              { color: colors.mutedForeground },
              isHeroStep && styles.bodyHero,
            ]}
          >
            {currentStep.body}
          </Text>
        )}
        {currentStep.bodyKind === "ripple-wave" && currentStep.title && (
          <Text
            style={[
              styles.title,
              styles.titleAfterBody,
              { color: colors.foreground },
            ]}
          >
            {currentStep.title}
          </Text>
        )}
        {currentStep.bodyKind === "ripple-wave" && currentStep.subtitle && (
          <Text style={[styles.subtitle, { color: colors.primary }]}>
            {currentStep.subtitle}
          </Text>
        )}

        {isCountryStep && (
          <>
            <PressableScale
              onPress={() => setPickerOpen(true)}
              haptic="light"
              style={styles.countryWrap}
              accessibilityLabel={
                myCountryCode
                  ? `Country ${myCountryName}, tap to change`
                  : "Tap to pick your country"
              }
            >
              <Surface
                elevation="md"
                radius="xl"
                background={colors.card}
                style={[
                  styles.countryRow,
                  myCountryCode && {
                    ...colors.shadows.glowAccent,
                  },
                ]}
              >
                <Text style={styles.countryRowFlag}>
                  {myCountryFlag ?? "🌍"}
                </Text>
                <Text
                  style={[
                    styles.countryRowText,
                    {
                      color: myCountryCode
                        ? colors.foreground
                        : colors.mutedForeground,
                    },
                  ]}
                >
                  {myCountryName ??
                    (gpsHint === "loading"
                      ? "Finding your location…"
                      : "Tap to pick your country")}
                </Text>
                {gpsHint === "loading" ? (
                  <ActivityIndicator size="small" color={colors.teal} />
                ) : (
                  <Text style={[styles.countryRowChange, { color: colors.teal }]}>
                    {myCountryCode ? "Change" : "Choose"}
                  </Text>
                )}
              </Surface>
            </PressableScale>
            {gpsHint === "suggested" && myCountryCode ? (
              <Text style={[styles.gpsHint, { color: colors.mutedForeground }]}>
                Suggested from your location — tap Change if you&apos;re traveling.
              </Text>
            ) : gpsHint === "unavailable" && !myCountryCode ? (
              <Text style={[styles.gpsHint, { color: colors.mutedForeground }]}>
                Pick the country you&apos;re in right now.
              </Text>
            ) : null}
          </>
        )}
      </Animated.View>

      <View
        style={[
          styles.footer,
          { paddingBottom: bottomPadding + 16 },
        ]}
      >
        <View style={styles.dots}>
          {STEPS.map((_, i) => {
            const active = i === step;
            return (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: active ? colors.primary : colors.secondary,
                    width: active ? 24 : 8,
                  },
                  active && colors.shadows.glowPrimary,
                ]}
              />
            );
          })}
        </View>

        {continueLocked ? (
          <View
            style={[
              styles.button,
              {
                backgroundColor: colors.secondary,
                opacity: 0.6,
              },
            ]}
          >
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
              Pick your country to continue
            </Text>
          </View>
        ) : (
          <PressableScale
            onPress={goNext}
            haptic="medium"
            style={styles.fullWidth}
          >
            <GradientCard
              gradient="primary"
              radius="pill"
              elevation="glowPrimary"
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={styles.buttonInner}>
                <Text
                  style={[styles.buttonText, { color: colors.primaryForeground }]}
                >
                  {step < STEPS.length - 1 ? "Continue" : "Let's start"}
                </Text>
              </View>
            </GradientCard>
          </PressableScale>
        )}

        {/* Skip is allowed on every intro step. On the country step it's
            only offered in dev/Expo Go (REQUIRE_COUNTRY === false) so we
            never have to fight the picker while testing — production
            builds make country selection mandatory. */}
        {(step < STEPS.length - 1 ||
          (isCountryStep && !REQUIRE_COUNTRY && !myCountryCode)) && (
          <PressableScale
            onPress={async () => {
              await completeOnboarding(
                myCountryCode && myCountryName && myCountryFlag
                  ? { code: myCountryCode, name: myCountryName, flag: myCountryFlag }
                  : undefined,
              );
              router.replace("/");
            }}
          >
            <Text style={[styles.skip, { color: colors.mutedForeground }]}>
              {isCountryStep ? "Skip — I'll set it later" : "Skip"}
            </Text>
          </PressableScale>
        )}
      </View>

      <CountryPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(c) => {
          setMyCountry(c.code, c.name, c.flag);
          setGpsHint("unavailable");
        }}
        selectedCode={myCountryCode}
        title="Where are you right now?"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fullWidth: {
    width: "100%",
  },
  globeWrapper: {
    alignItems: "center",
    gap: 14,
    paddingBottom: 8,
  },
  appName: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  appNameLarge: {
    fontSize: 34,
    letterSpacing: -1,
  },
  textSection: {
    flex: 1,
    paddingHorizontal: 36,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  title: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  subtitle: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  body: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 23,
    marginTop: 4,
  },
  bodyHero: {
    fontSize: 17,
    lineHeight: 26,
  },
  // Override line height for the ripple/wave paragraph only. The wave
  // glyph in that line renders at 28px tall (size=28, transparent
  // glyph artwork), which overflows the default 23px line height. 36px
  // gives the glyph ~8px of breathing room and keeps the three forced
  // lines spaced evenly regardless of which one carries an icon.
  bodyRippleWave: {
    lineHeight: 36,
  },
  // Spacing above the "Send a ripple. / Catch a wave." flourish that
  // sits BELOW the explanation paragraph on the ripple-wave step —
  // separates the takeaway tagline from the body copy without
  // affecting titles on other steps (which sit above the body and
  // don't need the offset).
  titleAfterBody: {
    marginTop: 40,
  },
  footer: {
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 16,
  },
  dots: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  button: {
    width: "100%",
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonInner: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  skip: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  countryWrap: {
    width: "100%",
    marginTop: 24,
  },
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    width: "100%",
  },
  countryRowFlag: {
    fontSize: 24,
  },
  countryRowText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  countryRowChange: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  gpsHint: {
    width: "100%",
    marginTop: 10,
    paddingHorizontal: 4,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
  },
});
