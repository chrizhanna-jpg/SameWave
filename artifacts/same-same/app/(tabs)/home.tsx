import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useContext, useEffect, useState } from "react";
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
import { shouldShowHomeWaiting } from "@/core/homeWaiting";
import { sceneFor } from "@/data/scenes";
import { chooseFromLibrary } from "@/device/photos";
import { isWaveSwooshPlaying, playOceanSound, shouldPlayHomeOceanOnFocus } from "@/device/sound";
import { useAppState } from "@/state/AppState";
import { SplashReadyContext } from "@/state/SplashReady";
import { setDraftPhoto, setDraftTopic } from "@/state/draft";
import { useTabBarClearance } from "@/state/TabBarHeight";
import { colors, layout, space } from "@/theme";

/**
 * Home tab: brand, topic, send actions, Account. Default launch tab.
 * Ocean swell: once on launch (splash), then on later Home returns — never
 * straight after the splash. Post-send waiting shows once after upload.
 */
export default function HomeScreen() {
  const router = useRouter();
  const splashReady = useContext(SplashReadyContext);
  const {
    travelling,
    sync,
    shouldAskForPushes,
    askForPushes,
    postSendWaiting,
    dismissPostSendWaiting,
  } = useAppState();
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

  useEffect(() => {
    if (!waiting || !shouldAskForPushes) return;
    const timer = setTimeout(() => void askForPushes(), 1500);
    return () => clearTimeout(timer);
  }, [waiting, shouldAskForPushes, askForPushes]);

  const playedForFocus = React.useRef(false);
  /** Deferred so React Strict Mode remounts cancel before waiting is cleared. */
  const dismissTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
      playedForFocus.current = false;
      let cancelled = false;
      const tryPlay = () => {
        if (cancelled || playedForFocus.current) return;
        if (!splashReady) return;
        if (isWaveSwooshPlaying()) {
          setTimeout(tryPlay, 200);
          return;
        }
        playedForFocus.current = true;
        // Skip the first Home focus right after splash — swell already played.
        if (!shouldPlayHomeOceanOnFocus()) return;
        void playOceanSound();
      };
      tryPlay();
      return () => {
        cancelled = true;
        // Leaving Home dismisses post-send waiting so re-entry shows send buttons.
        dismissTimer.current = setTimeout(() => {
          dismissPostSendWaiting();
          dismissTimer.current = null;
        }, 100);
      };
    }, [splashReady, dismissPostSendWaiting]),
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
        setDraftPhoto(photo);
        router.replace("/ripple");
      } catch {
        setDraftTopic(null);
        setProblem("That photo couldn't be opened. Try another.");
      }
      return;
    }
    // Camera first; capture replaces into the Ripple tab with the photo.
    router.push("/capture");
  };

  const pickFromLibrary = async () => {
    setProblem(null);
    setDraftTopic(null);
    try {
      const photo = await chooseFromLibrary();
      if (!photo) return;
      setDraftPhoto(photo);
      router.replace("/ripple");
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
            onPress={() => {
              setSendingAnother(true);
              dismissPostSendWaiting();
            }}
            style={styles.actionGap}
          />
        ) : (
          <>
            <Button
              label="Capture a moment"
              onPress={() => void beginCompose(null, false)}
              style={styles.actionGap}
              accessibilityHint="Opens the camera, then the Ripple tab to upload"
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
