/**
 * Preview-only: Feeling / Topic collapse screenshots (any order, no gating).
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
import { font, space } from "@/theme";

export type PickerShotMode =
  | "both-empty"
  | "both-collapsed"
  | "feeling-collapsed"
  | "feeling-open"
  | "topic-collapsed"
  | "topic-open";

export function PickerCollapseShotInner({ mode }: { mode: PickerShotMode }) {
  return (
    <Screen scroll scene={sceneFor.composeFallback}>
      <Frost kind="card" style={styles.card} contentStyle={styles.pad} clip={false}>
        {mode === "both-empty" ? (
          <BothEmptyShot />
        ) : mode === "both-collapsed" ? (
          <BothCollapsedShot />
        ) : mode === "feeling-collapsed" || mode === "feeling-open" ? (
          <FeelingShot mode={mode} />
        ) : (
          <TopicShot mode={mode} />
        )}
      </Frost>
    </Screen>
  );
}

function BothEmptyShot() {
  return (
    <View>
      <Txt variant="heading" style={styles.h}>
        This feels…
      </Txt>
      <EmotionPicker value={null} onChange={() => undefined} />
      <Txt variant="heading" style={styles.h}>
        What&apos;s the topic?
      </Txt>
      <TopicPicker value={null} onChange={() => undefined} />
    </View>
  );
}

function BothCollapsedShot() {
  const [emotion, setEmotion] = useState<string | null>("tired");
  const [topic, setTopic] = useState<string | null>("coffee");
  return (
    <View>
      <Txt variant="heading" style={styles.h}>
        This feels…
      </Txt>
      <EmotionPicker value={emotion} onChange={setEmotion} />
      <Txt variant="heading" style={styles.h}>
        What&apos;s the topic?
      </Txt>
      <TopicPicker value={topic} onChange={setTopic} />
    </View>
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
});
