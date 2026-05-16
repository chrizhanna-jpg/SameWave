import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { CelebrationMatchChips } from "@/components/CelebrationMatchChips";
import {
  CelebrationSwipeDismissHint,
  CelebrationSwipeHandle,
  celebrationDragScale,
} from "@/components/CelebrationSwipeDismiss";
import { ConnectionMapPreview } from "@/components/ConnectionMapPreview";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { getGeoTier, getTimeTier } from "@/utils/celebrations";

const FLASH_MAP_WIDTH = Dimensions.get("window").width - 48;

// Action a tap on one of the action pills should trigger after the
// flash dismisses. `undefined` means "just open the echo pair view".
export type EchoFlashAction = "share" | undefined;

interface Props {
  /** Country/flag/photo metadata for the two sides of the echo. */
  myCountryFlag?: string;
  myCountryCode?: string;
  theirCountry: string;
  theirCountryFlag: string;
  theirCountryCode?: string;
  myPhotoUri: string;
  theirPhotoUri: string;
  /** Theme that produced the echo (e.g. "Coffee", "Sunset"). */
  themeTitle?: string;
  themeEmoji?: string;
  myPhotoUploadedAt?: string;
  theirPhotoMinutesAgo?: number;
  /** Called when the flash is dismissed without opening / sharing. */
  onDone: () => void;
  /** Called when the user wants to open the full echo-pair view. */
  onOpen: () => void;
}

// Echo celebration overlay. Fires the moment a "same-same" turns into a
// mutual echo for either side of the pair (the responder via
// respondToEcho, the original offerer via the polling refresh that
// detects the new mutual). Twin sister of MatchFlash, but tuned for
// echoes: globe spinning between the two photos, big "ECHO" word
// across the top, share posts a system message instead of going
// through the watermark flow.
//
// Dismissal:
// - Swipe up or down → dismiss (snaps back if you don't pull far).
// - × button → dismiss.
// - Open → calls onOpen (parent navigates to /echo-pair).
// - Share → also navigates to /echo-pair (the "It's an Echo!" reveal),
//   where the actual system share sheet lives. We deliberately do NOT
//   pop the share sheet from the banner itself: the user expects a
//   match-style reveal moment first, where they can see both photos and
//   then choose to share. Going straight to the share sheet from the
//   banner felt jarring.
//
// We deliberately do NOT auto-dismiss. The user just got the rarest,
// best moment in the app — the flash sticks until they choose what
// to do with it.
export function EchoFlash({
  myCountryFlag,
  myCountryCode,
  theirCountry,
  theirCountryFlag,
  theirCountryCode,
  myPhotoUri,
  theirPhotoUri,
  themeTitle,
  themeEmoji = "✨",
  myPhotoUploadedAt,
  theirPhotoMinutesAgo,
  onDone,
  onOpen,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  const popIn = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const finishedRef = useRef(false);
  // Photo URIs may 404 (deleted by the other user, expired CDN, etc).
  // Track per-side load failure so we can render the flag fallback
  // instead of a blank gray square.
  const [myImgErr, setMyImgErr] = useState(false);
  const [theirImgErr, setTheirImgErr] = useState(false);

  const finish = (action: "auto" | "open" = "auto") => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (action === "open") {
      onOpen();
      return;
    }
    Animated.timing(fade, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => onDone());
  };

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
          Animated.timing(dragY, {
            toValue: g.dy > 0 ? 360 : -360,
            duration: 180,
            useNativeDriver: true,
          }).start(() => finish("auto"));
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
    // Echoes are the rarest moment in the app — give them the
    // celebration haptic, not just success.
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
      Animated.timing(popIn, {
        toValue: 1,
        duration: 520,
        delay: 80,
        easing: Easing.out(Easing.back(1.6)),
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const popScale = popIn.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });

  const timeTier = getTimeTier(myPhotoUploadedAt, theirPhotoMinutesAgo);
  const geoTier = getGeoTier(myCountryCode, theirCountryCode);
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
            backgroundColor: colors.gold + "ee",
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
        <CelebrationSwipeHandle
          style={[styles.topHandle, { top: insets.top + 4 }]}
        />

        <Pressable
          onPress={() => finish("auto")}
          style={[
            styles.dismissBtn,
            { top: insets.top + 12, right: insets.right + 16 },
          ]}
          hitSlop={12}
          accessibilityLabel="Dismiss wave"
        >
          <Icon name="x" size={20} color="rgba(0,16,24,0.7)" />
        </Pressable>

        <Text style={styles.tagline}>wave</Text>
        <Text style={styles.headline}>Wave!</Text>

        {(myCountryCode || theirCountryCode) && (
          <ConnectionMapPreview
            kind="wave"
            fromCode={myCountryCode}
            toCode={theirCountryCode}
            width={FLASH_MAP_WIDTH}
            height={Math.round(FLASH_MAP_WIDTH * 0.34)}
            style={styles.atlasPreview}
          />
        )}

        <View style={styles.thumbsRow}>
          <Animated.View
            style={[
              styles.thumbWrap,
              { opacity: popIn, transform: [{ scale: popScale }] },
            ]}
          >
            {myPhotoUri && !myImgErr ? (
              <Image
                source={{ uri: myPhotoUri }}
                style={styles.thumb}
                onError={() => setMyImgErr(true)}
              />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback]}>
                <Text style={styles.thumbFallbackFlag}>
                  {myCountryFlag || "🌍"}
                </Text>
              </View>
            )}
            <Text style={styles.thumbFlag}>{myCountryFlag || "🌍"}</Text>
          </Animated.View>

          <View style={styles.connector}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>

          <Animated.View
            style={[
              styles.thumbWrap,
              { opacity: popIn, transform: [{ scale: popScale }] },
            ]}
          >
            {theirPhotoUri && !theirImgErr ? (
              <Image
                source={{ uri: theirPhotoUri }}
                style={styles.thumb}
                onError={() => setTheirImgErr(true)}
              />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback]}>
                <Text style={styles.thumbFallbackFlag}>
                  {theirCountryFlag || "🌍"}
                </Text>
              </View>
            )}
            <Text style={styles.thumbFlag}>{theirCountryFlag || "🌍"}</Text>
          </Animated.View>
        </View>

        <Text style={styles.subline}>
          You and someone in {theirCountry} are on the same wavelength.
        </Text>

        {themeTitle ? (
          <CelebrationMatchChips
            themeTitle={themeTitle}
            themeEmoji={themeEmoji}
            timeTier={timeTier}
            geoTier={geoTier}
            accentColor={colors.gold}
          />
        ) : null}

        <View style={styles.ctaWrap}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              finish("open");
            }}
            style={styles.openSharePill}
            accessibilityLabel="Open and share this wave"
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
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 6,
    color: "rgba(0,16,24,0.65)",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  // Headline kept readable but no longer dwarfing the photos. The
  // celebration's two thumbnails were bumped to a tall portrait
  // 5:7 so the imagery is the visual anchor of the moment, with
  // the globe between them and a slim text/button stack around.
  headline: {
    fontSize: 22,
    fontWeight: "900",
    color: "#001018",
    letterSpacing: 1,
    marginBottom: 8,
    textAlign: "center",
  },
  atlasPreview: {
    marginBottom: 12,
    borderColor: "rgba(0,16,24,0.12)",
  },
  thumbsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  thumbWrap: {
    width: 100,
    height: 140,
    borderRadius: 18,
    position: "relative",
  },
  thumb: {
    width: 100,
    height: 140,
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
    bottom: -6,
    right: -6,
    fontSize: 24,
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
  subline: {
    fontSize: 13,
    fontWeight: "600",
    color: "#001018",
    marginBottom: 8,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  ctaWrap: {
    width: "100%",
    alignItems: "center",
    marginTop: 8,
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
