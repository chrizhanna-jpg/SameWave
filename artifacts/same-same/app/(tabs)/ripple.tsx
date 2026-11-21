import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { Frost } from "@/components/Frost";
import { RippleRings } from "@/components/RippleRings";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { dailyTopicFor } from "@/core/dailyTopic";
import { shouldShowHomeWaiting } from "@/core/homeWaiting";
import { sceneFor } from "@/data/scenes";
import { chooseFromLibrary } from "@/device/photos";
import { playOceanSound } from "@/device/sound";
import { useAppState } from "@/state/AppState";
import { setDraftPhoto, setDraftTopic } from "@/state/draft";
import { useTabBarClearance } from "@/state/TabBarHeight";
import { space } from "@/theme";

/**
 * Ripple tab: send / waiting focused. Account lives on Home.
 * Same post-send waiting gate as Home — travelling alone does not lock the UI.
 */
export default function RippleScreen() {
  const router = useRouter();
  const { travelling, sync, postSendWaiting, dismissPostSendWaiting } = useAppState();
  const [sendingAnother, setSendingAnother] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const waiting = shouldShowHomeWaiting({
    hasTravellingRipple: travelling !== null,
    postSendWaiting,
    sendingAnother,
  });
  const today = dailyTopicFor();
  const tabClearance = useTabBarClearance(space.md);

  useEffect(() => {
    setSendingAnother(false);
  }, [travelling?.photoId]);

  const dismissTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
      return () => {
        dismissTimer.current = setTimeout(() => {
          dismissPostSendWaiting();
          dismissTimer.current = null;
        }, 100);
      };
    }, [dismissPostSendWaiting]),
  );

  const beginCompose = async (topicId: string | null, locked = false) => {
    setProblem(null);
    setDraftTopic(topicId, { locked: locked && topicId !== null });
    if (Platform.OS === "web") {
      try {
        const photo = await chooseFromLibrary();
        if (!photo) {
          setDraftTopic(null);
          return;
        }
        void playOceanSound();
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

  return (
    <Screen
      scene={sceneFor.home}
      style={styles.screen}
      scroll
      reserveBottom={tabClearance}
    >
      <View style={styles.topPad} />
      <Frost kind="card" style={styles.brandCard} contentStyle={styles.brand}>
        {waiting ? (
          <>
            <RippleRings size={160} />
            <Txt variant="title" center style={styles.brandTitle}>
              Your Ripple is out there
            </Txt>
            <Txt tone="secondary" center style={styles.tagline}>
              We&apos;ll tell you when someone shares your moment.
            </Txt>
            <Txt
              variant="quiet"
              tone="quiet"
              center
              style={styles.caption}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              Waves usually arrive within a few days.
            </Txt>
          </>
        ) : (
          <>
            <BrandMark size={120} withName />
            <Txt tone="secondary" center style={styles.tagline}>
              Send a Ripple into the world.
            </Txt>
          </>
        )}
      </Frost>

      <Frost kind="card" style={styles.actionsCard} contentStyle={styles.actions}>
        {waiting ? (
          <Button
            kind="soft"
            label="Send another"
            onPress={() => {
              setSendingAnother(true);
              dismissPostSendWaiting();
            }}
            style={styles.actionGap}
          />
        ) : (
          <>
            <Button
              label="Send a Ripple"
              onPress={() => void beginCompose(null, false)}
              style={styles.actionGap}
            />
            <Button
              kind="soft"
              label="Today's topic"
              detail={today.label}
              detailTone="moon"
              onPress={() => void beginCompose(today.id, true)}
              style={styles.actionGap}
            />
          </>
        )}
        {problem ? (
          <Txt variant="quiet" tone="ember" center style={styles.actionGap}>
            {problem}
          </Txt>
        ) : null}
        {sync === "offline" ? (
          <Txt variant="quiet" tone="secondary" center style={styles.actionGap}>
            Can&apos;t reach SameWave right now. It will keep trying.
          </Txt>
        ) : null}
      </Frost>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, justifyContent: "flex-start" },
  topPad: { height: space.xl },
  brandCard: { flexGrow: 1, marginBottom: space.md },
  brand: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    gap: space.md,
    minHeight: 220,
  },
  brandTitle: { marginTop: space.sm },
  tagline: { maxWidth: 300 },
  caption: { alignSelf: "stretch", maxWidth: 320, paddingHorizontal: space.sm },
  actionsCard: { marginBottom: space.sm },
  actions: {
    width: "100%",
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    gap: space.sm,
  },
  actionGap: { alignSelf: "stretch" },
});
