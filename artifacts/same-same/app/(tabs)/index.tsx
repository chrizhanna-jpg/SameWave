import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { Button } from "@/components/Button";
import { RippleRings } from "@/components/RippleRings";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { chooseFromLibrary } from "@/device/photos";
import { useAppState } from "@/state/AppState";
import { setDraftPhoto } from "@/state/draft";
import { space } from "@/theme";

/**
 * The Ripple screen is always one of three things:
 * a Wave has arrived, a Ripple is travelling, or it is time to send one.
 */
export default function RippleScreen() {
  const router = useRouter();
  const { newWaves, travelling, sync, shouldAskForPushes, askForPushes } = useAppState();
  const [sendingAnother, setSendingAnother] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const arrived = newWaves[0] ?? null;
  const waiting = !arrived && travelling !== null && !sendingAnother;

  // A new Ripple replaces the choice to send another.
  useEffect(() => {
    setSendingAnother(false);
  }, [travelling?.photoId]);

  // Notifications are offered once, after the first Ripple has gone.
  useEffect(() => {
    if (!waiting || !shouldAskForPushes) return;
    const timer = setTimeout(() => void askForPushes(), 1500);
    return () => clearTimeout(timer);
  }, [waiting, shouldAskForPushes, askForPushes]);

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

  const takePhoto = () => {
    setProblem(null);
    // Browsers have no camera screen here; they go straight to choosing a photo.
    if (Platform.OS === "web") void pickFromLibrary();
    else router.push("/capture");
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.centre}>
        {arrived ? (
          <>
            <RippleRings size={240} />
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
              Your Ripple is travelling
            </Txt>
            <Txt tone="haze" center style={styles.line}>
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
            <Txt variant="title" center>
              Send a Ripple
            </Txt>
            <Txt tone="haze" center style={styles.line}>
              {travelling ? "Your last Ripple is still travelling." : "One photo of your day."}
            </Txt>
            <Button label="Take a photo" onPress={takePhoto} style={styles.main} />
            {Platform.OS !== "web" ? (
              <Button
                kind="quiet"
                label="Choose from your photos"
                onPress={pickFromLibrary}
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
          <Txt variant="quiet" tone="haze" center style={styles.line}>
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
  line: { marginTop: space.md },
  main: { marginTop: space.xl },
  quiet: { marginTop: space.md },
  foot: { flexDirection: "row", justifyContent: "center", gap: space.lg },
});
