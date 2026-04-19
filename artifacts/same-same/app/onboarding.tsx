import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { GlobeAnimation } from "@/components/GlobeAnimation";

const { width, height } = Dimensions.get("window");

const STEPS = [
  {
    title: "Different places.",
    subtitle: "Same people.",
    body: "You post a photo from your daily life. We instantly pair it with a visually similar photo from someone else — somewhere in the world.",
  },
  {
    title: "Swipe to judge.",
    subtitle: "Then discover.",
    body: "Is this moment 'Same Same' or 'Different'? You decide. Only then do we reveal where that photo was taken.",
  },
  {
    title: "Fill your world.",
    subtitle: "One match at a time.",
    body: "Every swipe connects you to a new country. Your World Map fills in as you discover how similar we all are.",
  },
];

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { completeOnboarding } = useApp();
  const [step, setStep] = React.useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const goNext = () => {
    if (step < STEPS.length - 1) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -20,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setStep((s) => s + 1);
        slideAnim.setValue(20);
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 300,
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.heroSection, { paddingTop: topPadding + 20 }]}>
        <GlobeAnimation size={90} />
        <Text style={[styles.appName, { color: colors.primary }]}>
          Same Same
        </Text>
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
        <Text style={[styles.title, { color: colors.foreground }]}>
          {STEPS[step].title}
        </Text>
        <Text style={[styles.subtitle, { color: colors.primary }]}>
          {STEPS[step].subtitle}
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          {STEPS[step].body}
        </Text>
      </Animated.View>

      <View
        style={[
          styles.footer,
          { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 },
        ]}
      >
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    i === step ? colors.primary : colors.secondary,
                  width: i === step ? 20 : 8,
                },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={goNext}
          activeOpacity={0.85}
        >
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
            {step < STEPS.length - 1 ? "Continue" : "Let's start"}
          </Text>
        </TouchableOpacity>

        {step < STEPS.length - 1 && (
          <TouchableOpacity onPress={() => { completeOnboarding(); router.replace("/(tabs)"); }}>
            <Text style={[styles.skip, { color: colors.mutedForeground }]}>
              Skip
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroSection: {
    alignItems: "center",
    paddingBottom: 32,
    gap: 16,
  },
  appName: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  textSection: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  title: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -1,
    lineHeight: 40,
  },
  subtitle: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -1,
    lineHeight: 40,
  },
  body: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 24,
    marginTop: 8,
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
  buttonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  skip: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
