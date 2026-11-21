import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { AccountAvatar } from "@/components/AccountAvatar";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { Frost, FrostIconWell } from "@/components/Frost";
import { Icon } from "@/components/Icon";
import { RippleRings } from "@/components/RippleRings";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { dailyTopicFor } from "@/core/dailyTopic";
import { sceneFor } from "@/data/scenes";
import { chooseFromLibrary } from "@/device/photos";
import { useAppState } from "@/state/AppState";
import { setDraftPhoto, setDraftTopic } from "@/state/draft";
import { useTabBarClearance } from "@/state/TabBarHeight";
import { colors, layout, space } from "@/theme";

/**
 * Home: Style 3 frosted cards over mist-lake-noboat (edited lake photo).
 * Soft "Today's topic · {name}" stays on one line.
 * HomeScene.tsx (vector illustration) stays in the repo unused for easy switch-back.
 */
export default function RippleScreen() {
  const router = useRouter();
  const { travelling, sync, shouldAskForPushes, askForPushes } = useAppState();
  const [sendingAnother, setSendingAnother] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const waiting = travelling !== null && !sendingAnother;
  const today = dailyTopicFor();
  // Option (a): lift the actions card clear of the absolute frosted tab bar.
  const tabClearance = useTabBarClearance(space.md);

  useEffect(() => {
    setSendingAnother(false);
  }, [travelling?.photoId]);

  useEffect(() => {
    if (!waiting || !shouldAskForPushes) return;
    const timer = setTimeout(() => void askForPushes(), 1500);
    return () => clearTimeout(timer);
  }, [waiting, shouldAskForPushes, askForPushes]);

  const beginCompose = async (topicId: string | null, locked = false) => {
    setProblem(null);
    // Daily flow locks the topic for capture → compose → send; ordinary send stays free.
    setDraftTopic(topicId, { locked: locked && topicId !== null });
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
    // Library from home is an ordinary send — never lock a Daily topic.
    setDraftTopic(null);
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
    <Screen
      scene={sceneFor.home}
      style={styles.screen}
      scroll
      reserveBottom={tabClearance}
    >
      <View style={styles.toolbar}>
        <Pressable
          onPress={() => router.push("/how-it-works")}
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="How it works"
        >
          <FrostIconWell>
            <Icon name="help" size={22} color={colors.waterMuted} />
          </FrostIconWell>
        </Pressable>
        <AccountAvatar onPress={() => router.push("/account")} />
      </View>

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
              Someone, somewhere is having a similar moment.
            </Txt>
          </>
        )}
      </Frost>

      <Frost kind="card" style={styles.actionsCard} contentStyle={styles.actions}>
        {waiting ? (
          <Button
            kind="soft"
            label="Send another"
            onPress={() => setSendingAnother(true)}
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
              accessibilityHint="Starts a Ripple locked to today's topic"
            />
            {Platform.OS !== "web" ? (
              <Button
                kind="quiet"
                label="Choose from your photos"
                onPress={() => void pickFromLibrary()}
                style={styles.actionGap}
              />
            ) : null}
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
  // flexGrow so the brand card fills tall phones; scroll + reserveBottom
  // keeps the actions card clear of the absolute tab bar on short ones.
  screen: { flexGrow: 1, justifyContent: "flex-start" },
  toolbar: {
    marginTop: layout.homeToolbarOffset,
    marginBottom: space.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: layout.iconButtonSize,
  },
  brandCard: {
    flexGrow: 1,
    marginBottom: space.md,
  },
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
  // Keep "…a few days." on one line on narrow phones (wrap was dropping "days").
  caption: { alignSelf: "stretch", maxWidth: 320, paddingHorizontal: space.sm },
  actionsCard: {
    marginBottom: space.sm,
  },
  actions: {
    width: "100%",
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    gap: space.sm,
  },
  actionGap: { alignSelf: "stretch" },
});
