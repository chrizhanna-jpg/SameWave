import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { space } from "@/theme";

const STEPS = [
  {
    title: "Send a Ripple",
    body: "One photo of your day, an emotion, and a Topic. Or tap Today for the shared Daily topic. Matching leans on the emotion and Topic together with the photo.",
  },
  {
    title: "Wait",
    body: "Your Ripple travels quietly. People who share today's Daily topic are more likely to find each other the same day.",
  },
  {
    title: "A Wave arrives",
    body: "Somewhere, someone had the same moment. The two photos meet. You can open the Wave again any time from your map.",
  },
] as const;

/** Short instructions, reached from a quiet line — never shown on first launch. */
export default function HowItWorksScreen() {
  const router = useRouter();
  return (
    <Screen scroll>
      <Header />
      <Txt variant="title">How it works</Txt>
      {STEPS.map((step, index) => (
        <View key={step.title} style={styles.step}>
          <Txt variant="quiet" tone="secondary">
            {String(index + 1).padStart(2, "0")}
          </Txt>
          <Txt variant="heading" style={styles.heading}>
            {step.title}
          </Txt>
          <Txt tone="secondary">{step.body}</Txt>
        </View>
      ))}
      <Button kind="soft" label="Got it" onPress={() => router.back()} style={styles.done} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { marginTop: space.xl },
  heading: { marginTop: space.xs, marginBottom: space.sm },
  done: { marginTop: space.xxl, marginBottom: space.lg },
});
