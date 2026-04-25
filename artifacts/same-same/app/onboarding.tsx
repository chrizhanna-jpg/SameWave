import React, { useRef } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { EchoGlobeLogo } from "@/components/EchoGlobeLogo";
import { CountryPickerModal } from "@/components/CountryPickerModal";
import { Surface } from "@/components/Surface";
import { GradientCard } from "@/components/GradientCard";
import { PressableScale } from "@/components/PressableScale";

// Only enforce country selection in production / published builds. In
// dev / Expo Go we keep the legacy "Skip — I'll set it later" behaviour
// so we never have to fight a country picker while testing other
// features. The soft GPS sanity check happens later, in the tabs
// layout, after the user has explored the app — see utils/tabVisits.
const REQUIRE_COUNTRY = !__DEV__;

const { width } = Dimensions.get("window");

const STEPS = [
  {
    kind: "intro" as const,
    title: null,
    subtitle: null,
    body: "Share a photo with a vibe. Somewhere in the world, someone is feeling the same as you.",
  },
  {
    kind: "intro" as const,
    title: "Echo back.",
    subtitle: "Make it mutual.",
    body: "Swipe 'Same Same' on photos that match your vibe. When someone Same-Sames you back — that's an Echo. Anonymous.",
  },
  {
    kind: "country" as const,
    title: "Where are you?",
    subtitle: null,
    body: "We use your country to celebrate when you match with someone close — same country, same continent, same little planet.",
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
      router.replace("/(tabs)");
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
          <EchoGlobeLogo
            globeSize={isHeroStep ? 200 : 120}
            color="#FFFFFF"
            taglineColor={colors.mutedForeground}
            showTagline={isHeroStep}
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
        <Text
          style={[
            styles.body,
            { color: colors.mutedForeground },
            isHeroStep && styles.bodyHero,
          ]}
        >
          {currentStep.body}
        </Text>

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
              router.replace("/(tabs)");
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
