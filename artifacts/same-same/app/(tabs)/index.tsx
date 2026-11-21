import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { RippleRings } from "@/components/RippleRings";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { dailyTopicFor } from "@/core/dailyTopic";
import { chooseFromLibrary } from "@/device/photos";
import { useAppState } from "@/state/AppState";
import { setDraftPhoto, setDraftTopic } from "@/state/draft";
import { space } from "@/theme";

/**
 * The Ripple screen is always one of three things:
 * a Wave has arrived, a Ripple is travelling, or it is time to send one.
 * The Daily topic sits quietly beside the main Ripple action.
 */
export default function RippleScreen() {
  const router = useRouter();
  const { newWaves, travelling, sync, shouldAskForPushes, askForPushes } = useAppState();
  const [sendingAnother, setSendingAnother] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const arrived = newWaves[0] ?? null;
  const waiting = !arrived && travelling !== null && !sendingAnother;
  const today = dailyTopicFor();

  useEffect(() => {
    setSendingAnother(false);
  }, [travelling?.photoId]);

  useEffect(() => {
    if (!waiting || !shouldAskForPushes) return;
    const timer = setTimeout(() => void askForPushes(), 1500);
    return () => clearTimeout(timer);
  }, [waiting, shouldAskForPushes, askForPushes]);

  const beginCompose = async (topicId: string | null) => {
    setProblem(null);
    setDraftTopic(topicId);
    if (Platform.OS === "web") {
      try {
        const photo = await chooseFromLibrary();
        if (!photo) {
          setDraftTopic(null);
          return;
        }
        setDraftPhoto(photo);
        router.push("/compose");
      } catch {
        setDraftTopic(null);
        setProblem("That photo couldn't be opened. Try another.");
      }
      return;
    }
    router.push("/capture");
  };

  const pickFromLibrary = async () => {
    setProblem(null);
    try {
      const photo = await chooseFromLibrary();
      if (!photo) return;
      setDraftPhoto(photo);
      router.push("/compose");
    } catch {
      setProblem("That photo couldn't be opened. Try another.");
    }
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.centre}>
        {arrived ? (
          <>
            <RippleRings size={220} />
            <Txt variant="title" center style={styles.title}>
              Your moment found a match
            </Txt>
            <Button
              label="Open your Wave"
              onPress={() => router.push({ pathname: "/wave/[id]", params: { id: arrived.id } })}
              style={styles.main}
            />
          </>
        ) : waiting ? (
          <>
            <RippleRings size={240} />
            <Txt variant="title" center style={styles.title}>
              Your Ripple is out there
            </Txt>
            <Txt tone="secondary" center style={styles.line}>
              We'll tell you when someone shares your moment.
            </Txt>
            <Txt variant="quiet" tone="quiet" center style={styles.line}>
              Waves usually arrive within a few days.
            </Txt>
            <Button
              kind="quiet"
              label="Send another"
              onPress={() => setSendingAnother(true)}
              style={styles.quiet}
            />
          </>
        ) : (
          <>
            <BrandMark size={96} withName />
            <Txt tone="secondary" center style={styles.line}>
              {travelling ? "Your last Ripple is still travelling." : "One photo of your day."}
            </Txt>
            <Button label="Send a Ripple" onPress={() => void beginCompose(null)} style={styles.main} />
            <Button
              kind="soft"
              label={`Today: ${today.label}`}
              onPress={() => void beginCompose(today.id)}
              style={styles.daily}
              accessibilityHint="Starts a Ripple with today's Daily topic already chosen"
            />
            {Platform.OS !== "web" ? (
              <Button
                kind="quiet"
                label="Choose from your photos"
                onPress={() => {
                  setDraftTopic(null);
                  void pickFromLibrary();
                }}
                style={styles.quiet}
              />
            ) : null}
          </>
        )}
        {problem ? (
          <Txt variant="quiet" tone="ember" center style={styles.line}>
            {problem}
          </Txt>
        ) : null}
        {sync === "offline" ? (
          <Txt variant="quiet" tone="secondary" center style={styles.line}>
            Can't reach SameWave right now. It will keep trying.
          </Txt>
        ) : null}
      </View>

      <View style={styles.foot}>
        <Button kind="quiet" label="How it works" onPress={() => router.push("/how-it-works")} />
        <Button kind="quiet" label="Account" onPress={() => router.push("/account")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: "space-between" },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { marginTop: space.lg },
  line: { marginTop: space.md, maxWidth: 300 },
  main: { marginTop: space.xl, alignSelf: "stretch" },
  daily: { marginTop: space.md, alignSelf: "stretch" },
  quiet: { marginTop: space.md },
  foot: { flexDirection: "row", justifyContent: "center", gap: space.lg },
});
