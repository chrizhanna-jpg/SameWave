/**
 * Preview-only: Feeling / Topic collapse + sequencing screenshots.
 */
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";

import { EmotionPicker } from "@/components/EmotionPicker";
import { Frost } from "@/components/Frost";
import { Screen } from "@/components/Screen";
import { TopicPicker } from "@/components/TopicPicker";
import { TypeAheadPicker } from "@/components/TypeAheadPicker";
import { Txt } from "@/components/Txt";
import { filterEmotions } from "@/data/emotions";
import { filterTopics, topicFor } from "@/data/topics";
import { sceneFor } from "@/data/scenes";
import { colors, font, radius, space } from "@/theme";

export type PickerShotMode =
  | "feeling-collapsed"
  | "feeling-open"
  | "topic-waiting"
  | "topic-collapsed"
  | "topic-open"
  | "today-waiting";

export function PickerCollapseShotInner({ mode }: { mode: PickerShotMode }) {
  return (
    <Screen scroll scene={sceneFor.composeFallback}>
      <Frost kind="card" style={styles.card} contentStyle={styles.pad} clip={false}>
        {mode === "feeling-collapsed" || mode === "feeling-open" ? (
          <FeelingShot mode={mode} />
        ) : mode === "topic-waiting" ? (
          <TopicWaitingShot />
        ) : mode === "today-waiting" ? (
          <TodayWaitingShot />
        ) : (
          <TopicShot mode={mode} />
        )}
      </Frost>
    </Screen>
  );
}

function FeelingShot({ mode }: { mode: "feeling-collapsed" | "feeling-open" }) {
  const [value, setValue] = useState<string | null>("tired");
  if (mode === "feeling-open") {
    return (
      <View>
        <Txt variant="heading" style={styles.h}>
          This feels…
        </Txt>
        <TypeAheadPicker
          value={value}
          selectedLabel="Tired"
          onChange={setValue}
          filter={(q, n) => filterEmotions(q, n)}
          placeholder="This feels…"
          searchAccessibilityLabel="This feels…"
          valueKind="Feeling"
          initialQuery="tir"
        />
      </View>
    );
  }
  return (
    <View>
      <Txt variant="heading" style={styles.h}>
        This feels…
      </Txt>
      <EmotionPicker value={value} onChange={setValue} />
    </View>
  );
}

function TopicWaitingShot() {
  return (
    <View>
      <Txt variant="heading" style={styles.h}>
        This feels…
      </Txt>
      <EmotionPicker value={null} onChange={() => undefined} />
      <Txt variant="heading" style={styles.h}>
        What&apos;s the topic?
      </Txt>
      <TopicPicker value={null} onChange={() => undefined} disabled />
    </View>
  );
}

function TodayWaitingShot() {
  const label = topicFor("coffee")?.label ?? "Coffee & tea";
  return (
    <View>
      <Txt variant="heading" style={styles.h}>
        This feels…
      </Txt>
      <EmotionPicker value={null} onChange={() => undefined} />
      <Txt variant="heading" style={styles.h}>
        What&apos;s the topic?
      </Txt>
      <View
        style={[styles.lockedChip, styles.topicWaiting]}
        accessibilityState={{ disabled: true }}
        accessibilityLabel={`Today's topic: ${label}. Choose a feeling first.`}
      >
        <Txt variant="quiet" tone="secondary">
          Today&apos;s topic
        </Txt>
        <Txt tone="secondary">{label}</Txt>
        <Txt variant="quiet" tone="secondary">
          Choose a feeling first
        </Txt>
      </View>
    </View>
  );
}

function TopicShot({ mode }: { mode: "topic-collapsed" | "topic-open" }) {
  const [value, setValue] = useState<string | null>("coffee");
  if (mode === "topic-open") {
    return (
      <View>
        <Txt variant="heading" style={styles.h}>
          What&apos;s the topic?
        </Txt>
        <TypeAheadPicker
          value={value}
          selectedLabel={topicFor(value)?.label ?? "Coffee & tea"}
          onChange={setValue}
          filter={(q, n) => filterTopics(q, n)}
          placeholder="Type a topic"
          searchAccessibilityLabel="Search Topics"
          valueKind="Topic"
          initialQuery="cof"
        />
      </View>
    );
  }
  return (
    <View>
      <Txt variant="heading" style={styles.h}>
        What&apos;s the topic?
      </Txt>
      <TopicPicker value={value} onChange={setValue} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { margin: space.md },
  pad: { padding: space.lg },
  h: { marginTop: space.md, marginBottom: space.sm, fontFamily: font.bold },
  lockedChip: {
    marginTop: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: "rgba(222, 242, 254, 0.72)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    gap: space.xs,
  },
  topicWaiting: {
    backgroundColor: colors.surface,
    opacity: 0.72,
  },
});
