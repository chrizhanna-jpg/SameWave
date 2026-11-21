import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { AccountAvatar } from "@/components/AccountAvatar";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { RippleRings } from "@/components/RippleRings";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { dailyTopicFor } from "@/core/dailyTopic";
import { chooseFromLibrary } from "@/device/photos";
import { useAppState } from "@/state/AppState";
import { setDraftPhoto, setDraftTopic } from "@/state/draft";
import { colors, layout, space } from "@/theme";

/**
 * Home: quiet brand group above, one primary send action in the thumb zone,
 * and a lowered toolbar (? left, account avatar right).
 */
export default function RippleScreen() {
  const router = useRouter();
  const { travelling, sync, shouldAskForPushes, askForPushes } = useAppState();
  const [sendingAnother, setSendingAnother] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const waiting = travelling !== null && !sendingAnother;
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
      <View style={styles.toolbar}>
        <Pressable
          onPress={() => router.push("/how-it-works")}
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="How it works"
          style={styles.iconBtn}
        >
          <Icon name="help" size={22} color={colors.waterMuted} />
        </Pressable>
        <AccountAvatar onPress={() => router.push("/account")} />
      </View>

      {waiting ? (
        <View style={styles.brand}>
          <RippleRings size={200} />
          <Txt variant="title" center style={styles.brandTitle}>
            Your Ripple is out there
          </Txt>
          <Txt tone="secondary" center style={styles.tagline}>
            We&apos;ll tell you when someone shares your moment.
          </Txt>
          <Txt variant="quiet" tone="quiet" center style={styles.caption}>
            Waves usually arrive within a few days.
          </Txt>
        </View>
      ) : (
        <View style={styles.brand}>
          <BrandMark size={120} withName />
          <Txt tone="secondary" center style={styles.tagline}>
            Someone, somewhere is having a similar moment.
          </Txt>
        </View>
      )}

      <View style={styles.actions}>
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
              onPress={() => void beginCompose(null)}
              style={styles.actionGap}
            />
            <Button
              kind="soft"
              label={`Today: ${today.label}`}
              onPress={() => void beginCompose(today.id)}
              style={styles.actionGap}
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
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: "flex-start" },
  toolbar: {
    marginTop: layout.homeToolbarOffset,
    marginBottom: space.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: layout.iconButtonSize,
  },
  iconBtn: {
    width: layout.iconButtonSize,
    height: layout.iconButtonSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: layout.iconButtonSize / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  brand: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingVertical: space.lg,
    gap: space.md,
  },
  brandTitle: { marginTop: space.sm },
  tagline: { maxWidth: 300 },
  caption: { maxWidth: 280 },
  actions: {
    width: "100%",
    paddingBottom: space.md,
    gap: space.sm,
  },
  actionGap: { alignSelf: "stretch" },
});
