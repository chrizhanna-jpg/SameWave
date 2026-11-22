import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useContext, useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";

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
import { colors, font, layout, space } from "@/theme";

/**
 * Home tab: brand, topic, send actions, Account. Default launch tab.
 * Ocean swell: once per cold start (splash, or Home once if splash skipped it).
 * Returning to Home from tabs / background stays silent. Post-send waiting
 * shows once after upload.
 *
 * The two Frost cards sit in a pinned footer above the absolute tab bar so
 * they never scroll under it (gesture or 3-button nav). Only the toolbar /
 * upper area may scroll, and that ScrollView ends above the footer.
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
  // Measured tab bar height (incl. safe-area pad) + gap — Android gesture / 3-button.
  const tabClearance = useTabBarClearance(space.lg);

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
      // Cards are pinned in the footer; Screen itself must not scroll them.
      reserveBottom={0}
    >
      <View style={styles.body}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          // Scroll region ends above the pinned cards — never draws under them.
          bounces={false}
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
        </ScrollView>

        <View
          style={[styles.pinned, { paddingBottom: tabClearance }]}
          accessibilityLabel="Home cards"
        >
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
                <Txt tone="secondary" center style={styles.brandLine}>
                  Send a Ripple, Catch a Wave
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
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, width: "100%" },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1 },
  toolbar: {
    marginTop: layout.homeToolbarOffset,
    marginBottom: space.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: layout.iconButtonSize,
  },
  /** Non-scrolling footer: both cards sit just above the absolute tab bar. */
  pinned: {
    flexShrink: 0,
    width: "100%",
    gap: space.md,
  },
  brandCard: {
    width: "100%",
  },
  brand: {
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
  /** Same size/colour as the tagline above; Inter_700Bold. */
  brandLine: { maxWidth: 300, fontFamily: font.bold },
  caption: { alignSelf: "stretch", maxWidth: 320, paddingHorizontal: space.sm },
  actionsCard: {
    width: "100%",
  },
  actions: {
    width: "100%",
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    gap: space.sm,
  },
  actionGap: { alignSelf: "stretch" },
});
