import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
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
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { GlobeAnimation } from "@/components/GlobeAnimation";

// Action a tap on one of the action pills should trigger after the
// flash dismisses. `undefined` means "just open the echo pair view".
export type EchoFlashAction = "share" | undefined;

interface Props {
  /** Country/flag/photo metadata for the two sides of the echo. */
  myCountryFlag?: string;
  theirCountry: string;
  theirCountryFlag: string;
  myPhotoUri: string;
  theirPhotoUri: string;
  /** Theme that produced the echo (e.g. "Coffee", "Sunset"). */
  themeTitle?: string;
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
  theirCountry,
  theirCountryFlag,
  myPhotoUri,
  theirPhotoUri,
  themeTitle,
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
    Animated.timing(fade, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      if (action === "auto") onDone();
      else onOpen();
    });
  };

  // Both action buttons (Open and Share) navigate to the /echo-pair
  // reveal screen. The reveal screen is where the actual system share
  // sheet is invoked, so the user always sees the celebration moment
  // and both photos before deciding what to do.
  const handleShare = () => {
    finish("open");
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

  return (
    <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          styles.backdrop,
          { backgroundColor: colors.gold + "ee", opacity: fade },
        ]}
      />
      <Animated.View
        style={[
          styles.center,
          {
            opacity: fade,
            transform: [{ scale }, { translateY: dragY }],
          },
        ]}
        pointerEvents="box-none"
      >
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

        {/* The two photo thumbnails with the spinning Echo globe
            between them — visually communicates "your vibes met in
            the middle of the world". */}
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

          <Animated.View
            style={[
              styles.globeWrap,
              { opacity: popIn, transform: [{ scale: popScale }] },
            ]}
          >
            <GlobeAnimation size={64} />
          </Animated.View>

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

        {themeTitle && (
          <View style={styles.themePill}>
            <Text style={styles.themeText}>{themeTitle}</Text>
          </View>
        )}

        <View style={styles.actionRow}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              finish("open");
            }}
            style={styles.openPill}
            accessibilityLabel="Open wave"
          >
            <Text style={styles.openText}>Open</Text>
            <Icon name="arrow-right" size={20} color="#001018" />
          </Pressable>

          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              void handleShare();
            }}
            style={styles.secondaryPill}
            accessibilityLabel="Share wave"
          >
            <Icon name="share" size={20} color="#fff" />
            <Text style={styles.secondaryText}>Share</Text>
          </Pressable>
        </View>

        <Text style={styles.hint}>swipe down to dismiss</Text>
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
  globeWrap: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  subline: {
    fontSize: 13,
    fontWeight: "600",
    color: "#001018",
    marginBottom: 8,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  themePill: {
    backgroundColor: "rgba(0,16,24,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 14,
  },
  themeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#001018",
    letterSpacing: 0.3,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 2,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  openPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
  },
  openText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#001018",
    letterSpacing: 0.5,
  },
  secondaryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,16,24,0.65)",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
  },
  secondaryText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },
  hint: {
    marginTop: 12,
    fontSize: 11,
    color: "rgba(0,16,24,0.55)",
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});
