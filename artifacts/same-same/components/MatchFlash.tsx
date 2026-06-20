import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { CelebrationMatchChips } from "@/components/CelebrationMatchChips";
import {
  CelebrationSwipeDismissHint,
  CelebrationSwipeHandle,
  celebrationDragScale,
} from "@/components/CelebrationSwipeDismiss";
import { ConnectionMapPreview } from "@/components/ConnectionMapPreview";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { getGeoTierForPhotos, getTimeTier } from "@/utils/celebrations";
import { photoCountryDisplay, resolveCaptureCountryCode } from "@/utils/photoCountry";

const FLASH_MAP_WIDTH = Dimensions.get("window").width - 48;

// Action a tap on one of the secondary pills should trigger on the
// receiving /reveal screen. `undefined` means "just open it".
// "paywall" lives on the /reveal share flow now — the flash is
// intentionally minimal and never hosts the watermark upsell.
export type MatchFlashAction = "share" | undefined;

interface Props {
  theirCountry: string;
  theirCountryFlag: string;
  theirCountryCode?: string;
  myCountryFlag?: string;
  myCountryCode?: string;
  myCaptureCountryCode?: string;
  theirCaptureCountryCode?: string;
  themeTitle: string;
  themeEmoji: string;
  /** Thumbnail of the user's photo and the matched photo. */
  myPhotoUri?: string;
  theirPhotoUri?: string;
  /** Used to compute the "Same Minute / Hour / Day" tier badge. */
  myPhotoUploadedAt?: string;
  theirPhotoMinutesAgo?: number;
  onDone: () => void;
  /** Called with the requested action (or undefined for plain open). */
  onOpenFull: (action?: MatchFlashAction) => void;
}

// Per-swipe celebration that overlays the swipe card. Designed to feel
// like a beat in the rhythm — not a full stop. Shows the country reveal,
// the two photos that matched, and small "Same Day / Same Country"
// badges so the user gets the texture of WHY this match is rare.
//
// Dismissal:
// - Swipe down (or up) → dismiss back into the swipe deck.
// - Tap the × button → dismiss.
// - Tap "Open" → navigate to the full /reveal screen.
// - Tap "Share" → navigate to /reveal pre-firing the share dialog.
//
// We deliberately do NOT auto-dismiss anymore — users said the timer
// felt rushed, especially with the new badges to read. The flash sticks
// until the user explicitly chooses what to do with it.
export function MatchFlash({
  theirCountry,
  theirCountryFlag,
  theirCountryCode,
  myCountryFlag,
  myCountryCode,
  myCaptureCountryCode,
  theirCaptureCountryCode,
  themeTitle,
  themeEmoji,
  myPhotoUri,
  theirPhotoUri,
  myPhotoUploadedAt,
  theirPhotoMinutesAgo,
  onDone,
  onOpenFull,
}: Props) {
  const colors = useColors();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  const flagPop = useRef(new Animated.Value(0)).current;
  // Tracks the in-progress swipe so the card translates with the
  // user's finger before settling back or dismissing.
  const dragY = useRef(new Animated.Value(0)).current;
  // Guard so a swipe + button tap landing in the same frame still
  // results in exactly one transition.
  const finishedRef = useRef(false);

  // `mode` is intentionally non-optional. Using a default parameter
  // here previously caused `finish(undefined)` (from the Open/Share
  // button handlers) to be coerced back to the default "dismiss"
  // branch, so both buttons appeared to do nothing.
  const finish = (mode: "dismiss" | "open" | "share") => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (mode !== "dismiss") {
      // Navigate immediately — deferring until the fade-out completes
      // could race with overlay unmount and land on an unmatched route.
      onOpenFull(mode === "share" ? "share" : undefined);
      return;
    }
    Animated.timing(fade, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => onDone());
  };

  // Swipe-to-dismiss: vertical drag of more than ~80px (or a fast
  // flick at >0.7 vy) commits to dismissing. Anything less snaps the
  // card back into place. We also bail out of the gesture if the user
  // is dragging horizontally — that's not our gesture to handle.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        dragY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dy) > 80 || Math.abs(g.vy) > 0.7) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          // Animate the card off in the swipe direction for a moment
          // before kicking off the fade — feels less abrupt than just
          // cutting the card during dismissal.
          Animated.timing(dragY, {
            toValue: g.dy > 0 ? 360 : -360,
            duration: 180,
            useNativeDriver: true,
          }).start(() => finish("dismiss"));
        } else {
          Animated.spring(dragY, {
            toValue: 0,
            tension: 140,
            friction: 9,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, {
          toValue: 0,
          tension: 140,
          friction: 9,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        tension: 120,
        friction: 9,
        useNativeDriver: true,
      }),
      Animated.timing(flagPop, {
        toValue: 1,
        duration: 520,
        delay: 80,
        easing: Easing.out(Easing.back(1.6)),
        useNativeDriver: true,
      }),
    ]).start();
    // No auto-dismiss timer — see component docstring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flagScale = flagPop.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });
  const flagOpacity = flagPop;

  // Tier badges: "Same Minute / Hour / Day / Week" (time) and
  // "Same Country / Continent / Planet" (geography). The flash always
  // renders both — even the "Same Planet" baseline is part of the
  // story we're telling here.
  const timeTier = getTimeTier(myPhotoUploadedAt, theirPhotoMinutesAgo);
  const myCap = resolveCaptureCountryCode(myCaptureCountryCode, myPhotoUri);
  const theirCap = resolveCaptureCountryCode(
    theirCaptureCountryCode,
    theirPhotoUri,
  );
  const myDisplay = photoCountryDisplay(myCap);
  const theirDisplay = photoCountryDisplay(theirCap);
  const geoTier = getGeoTierForPhotos(myCap, theirCap);
  const dragScale = celebrationDragScale(dragY);
  const backdropDragOpacity = dragY.interpolate({
    inputRange: [-140, 0, 140],
    outputRange: [0.55, 1, 0.55],
    extrapolate: "clamp",
  });

  return (
    <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          styles.backdrop,
          {
            backgroundColor: colors.teal + "ee",
            opacity: Animated.multiply(fade, backdropDragOpacity),
          },
        ]}
      />
      <Animated.View
        style={[
          styles.center,
          {
            opacity: fade,
            transform: [
              { scale: Animated.multiply(scale, dragScale) },
              { translateY: dragY },
            ],
          },
        ]}
        pointerEvents="box-none"
      >
        <CelebrationSwipeHandle style={styles.topHandle} />

        {/* Explicit dismiss affordance for users who don't discover the
            swipe gesture. Sits in the top-right of the celebration card
            so it's visible without dominating the layout. */}
        <Pressable
          onPress={() => finish("dismiss")}
          style={styles.dismissBtn}
          hitSlop={12}
          accessibilityLabel="Dismiss match"
        >
          <Icon name="x" size={20} color="rgba(0,16,24,0.7)" />
        </Pressable>

        <Text style={styles.tagline}>a ripple</Text>

        {(myDisplay.code || theirDisplay.code) && (
          <ConnectionMapPreview
            kind="ripple"
            fromCode={myDisplay.code}
            toCode={theirDisplay.code}
            width={FLASH_MAP_WIDTH}
            height={Math.round(FLASH_MAP_WIDTH * 0.34)}
            style={styles.atlasPreview}
          />
        )}

        {/* Two photo thumbnails — one from each country — with the
            corresponding flag badged into the bottom-right corner.
            Falls back to a flag-only layout if URIs aren't available
            (shouldn't happen in production but keeps the screen
            from collapsing in unusual states). */}
        <View style={styles.thumbsRow}>
          <Animated.View
            style={[
              styles.thumbWrap,
              {
                opacity: flagOpacity,
                transform: [{ scale: flagScale }],
              },
            ]}
          >
            {myPhotoUri ? (
              <Image
                source={{ uri: myPhotoUri }}
                style={styles.thumb}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={myPhotoUri}
              />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback]}>
                <Text style={styles.thumbFallbackFlag}>
                  {myDisplay.flag}
                </Text>
              </View>
            )}
            <Text style={styles.thumbFlag}>{myDisplay.flag}</Text>
          </Animated.View>
          <View style={styles.connector}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
          <Animated.View
            style={[
              styles.thumbWrap,
              {
                opacity: flagOpacity,
                transform: [{ scale: flagScale }],
              },
            ]}
          >
            {theirPhotoUri ? (
              <Image
                source={{ uri: theirPhotoUri }}
                style={styles.thumb}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={theirPhotoUri}
              />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback]}>
                <Text style={styles.thumbFallbackFlag}>
                  {theirDisplay.flag}
                </Text>
              </View>
            )}
            <Text style={styles.thumbFlag}>{theirDisplay.flag}</Text>
          </Animated.View>
        </View>

        <Text style={styles.country}>{theirDisplay.name}</Text>

        <CelebrationMatchChips
          themeTitle={themeTitle}
          themeEmoji={themeEmoji}
          timeTier={timeTier}
          geoTier={geoTier}
          accentColor={colors.teal}
        />

        <View style={styles.ctaWrap}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              finish("open");
            }}
            style={styles.openSharePill}
            accessibilityLabel="Open and share this match"
          >
            <Icon name="share" size={18} color="#FFFFFF" />
            <Text style={styles.openShareText}>Open / Share</Text>
            <Icon name="arrow-right" size={18} color="#FFFFFF" />
          </Pressable>
        </View>

        <CelebrationSwipeDismissHint dragY={dragY} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  topHandle: {
    position: "absolute",
    top: 12,
    left: 0,
    right: 0,
  },
  dismissBtn: {
    position: "absolute",
    top: 32,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  tagline: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 4,
    color: "rgba(0,16,24,0.55)",
    textTransform: "uppercase",
    marginBottom: 12,
  },
  atlasPreview: {
    marginBottom: 14,
    borderColor: "rgba(0,16,24,0.12)",
  },
  thumbsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
  },
  thumbWrap: {
    width: 100,
    height: 100,
    borderRadius: 18,
    overflow: "visible",
    position: "relative",
  },
  thumb: {
    width: 100,
    height: 100,
    borderRadius: 18,
    backgroundColor: "rgba(0,16,24,0.18)",
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  thumbFallbackFlag: {
    fontSize: 44,
  },
  thumbFlag: {
    position: "absolute",
    bottom: -8,
    right: -8,
    fontSize: 34,
    // White circle behind the emoji so it pops against any photo.
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowRadius: 4,
  },
  connector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(0,16,24,0.55)",
  },
  country: {
    fontSize: 26,
    fontWeight: "800",
    color: "#001018",
    marginBottom: 14,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  ctaWrap: {
    width: "100%",
    alignItems: "center",
    marginTop: 10,
  },
  openSharePill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minWidth: 240,
    paddingHorizontal: 36,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#001018",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
  openShareText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.4,
  },
});
