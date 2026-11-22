import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet } from "react-native";

import { Button } from "@/components/Button";
import { Frost } from "@/components/Frost";
import { Header } from "@/components/Header";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { sceneFor } from "@/data/scenes";
import { space } from "@/theme";

const STEPS = [
  {
    title: "Capture a moment",
    body: "One photo of your day, an emotion, and a Topic. Or tap Today for the shared Daily topic. Matching leans on the emotion and Topic together with the photo.",
  },
  {
    title: "Wait",
    body: "Your Ripple travels quietly. People who share today's Daily topic are more likely to find each other the same day.",
  },
  {
    title: "A Wave arrives",
    body: "Someone, somewhere is having a similar moment. The two photos meet. You can open the Wave again any time from your map.",
  },
] as const;

/** Short instructions on a frosted card over a calm Style 3 scene. */
export default function HowItWorksScreen() {
  const router = useRouter();
  return (
    <Screen scroll scene={sceneFor.howItWorks}>
      <Header />
      <Frost kind="card" style={styles.card} contentStyle={styles.pad}>
        <Txt variant="title">How it works</Txt>
        <Txt tone="secondary" style={styles.line}>
          A match is a ripple, and a match back is a wave.
        </Txt>
        {STEPS.map((step, index) => (
          <Frost key={step.title} kind="card" style={styles.step} contentStyle={styles.stepPad}>
            <Txt variant="quiet" tone="secondary">
              {String(index + 1).padStart(2, "0")}
            </Txt>
            <Txt variant="heading" style={styles.heading}>
              {step.title}
            </Txt>
            <Txt tone="secondary">{step.body}</Txt>
          </Frost>
        ))}
        <Button kind="soft" label="Got it" onPress={() => router.back()} style={styles.done} />
      </Frost>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: space.lg },
  pad: { paddingHorizontal: space.lg, paddingVertical: space.lg },
  line: { marginTop: space.md, marginBottom: space.sm },
  step: { marginTop: space.lg },
  stepPad: { paddingHorizontal: space.md, paddingVertical: space.md },
  heading: { marginTop: space.xs, marginBottom: space.sm },
  done: { marginTop: space.xxl, marginBottom: space.sm },
});
