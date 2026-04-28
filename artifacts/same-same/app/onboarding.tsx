import React, { useRef } from "react";
import {
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

// Only enforce country selection in production / published builds. In
// dev / Expo Go we keep the legacy "Skip — I'll set it later" behaviour
// so we never have to fight a country picker while testing other
// features. The soft GPS sanity check happens later, in the tabs
// layout, after the user has explored the app — see utils/tabVisits.
const REQUIRE_COUNTRY = !__DEV__;

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
    body: "Share a photo of your moment. Somewhere in the world, someone is on the same wavelength as you.",
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
    title: "Your Country?",
    subtitle: null,
    body: "Will you Ripple with someone in the same country, same continent or same planet?",
  },
];

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { completeOnboarding, myCountryCode, myCountryName, myCountryFlag, setMyCountry } = useApp();
  const [step, setStep] = React.useState(0);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const globeScale = useRef(new Animated.Value(1)).current;

  const goNext = () => {
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
      completeOnboarding();
      // Route through "/" so the index gate decides whether sign-in is
      // still required (first-time users complete the tutorial BEFORE
      // they're asked to sign in) or it can drop them on the home tabs.
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
        {currentStep.title && (
          <Text style={[styles.title, { color: colors.foreground }]}>
            {currentStep.title}
          </Text>
        )}
        {currentStep.subtitle && (
          <Text style={[styles.subtitle, { color: colors.primary }]}>
            {currentStep.subtitle}
          </Text>
        )}
        {currentStep.bodyKind === "ripple-wave" ? (
          // One flowing paragraph: words wrap naturally, icons sit
          // inline at the same baseline as the text. Previously the
          // row-of-chunks layout broke awkwardly between fragments —
          // "Swipe Ripple [icon]" would land on its own line while
          // "for photos that match" wrapped beneath it. Nesting the
          // icons inside a single <Text> lets the paragraph reflow
          // cleanly at any width.
          <Text
            style={[
              styles.body,
              styles.bodyRippleWave,
              { color: colors.mutedForeground },
            ]}
            accessibilityLabel="Swipe Ripple for photos that match your moment. If the other person reciprocates, it's a Wave."
          >
            Swipe Ripple{" "}
            <Icon name="ripple" size={18} color={colors.teal} />
            {" "}for photos that match your moment. If the other person reciprocates, it&apos;s a Wave{" "}
            {/* WaveIcon multiplies its `size` by 2 internally (see
                components/WaveIcon.tsx WAVE_SCALE). Size={33.75} renders
                at 67.5px — 1.5× the previous 45px so the brand glyph +
                wordmark reads as a strong inline anchor for the word
                "Wave". The translateY nudge drops the glyph slightly
                below the text baseline so it sits visually centred on
                the cap-height of the surrounding sentence rather than
                hanging off the top of the line. */}
            <Icon
              name="wave"
              size={33.75}
              color={colors.gold}
              style={{ transform: [{ translateY: 8 }] }}
            />.
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

        {isCountryStep && (
          <PressableScale
            onPress={() => setPickerOpen(true)}
            haptic="light"
            style={styles.countryWrap}
            accessibilityLabel="Pick your country"
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
                {myCountryName ?? "Tap to pick your country"}
              </Text>
              <Text style={[styles.countryRowChange, { color: colors.teal }]}>
                {myCountryCode ? "Change" : "Choose"}
              </Text>
            </Surface>
          </PressableScale>
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
            onPress={() => {
              completeOnboarding();
              // Route through "/" so the gate enforces sign-in next if
              // the user skipped the tutorial before authenticating.
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
        onSelect={(c) => setMyCountry(c.code, c.name, c.flag)}
        selectedCode={myCountryCode}
        title="Where in the world are you?"
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
  // glyph in that line renders at 45px (Icon size 22.5 × WAVE_SCALE 2),
  // which overflows the default 23px line height and crashes into the
  // line above — clipping the final "it's a Wave" line. 52px gives the
  // 45px icon ~7px of breathing room and keeps spacing even between
  // all three wrapped lines, regardless of which one carries an icon.
  bodyRippleWave: {
    lineHeight: 52,
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
});
