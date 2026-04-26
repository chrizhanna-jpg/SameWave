import React, { useEffect, useRef } from "react";
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
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { getGeoTier, getTimeTier } from "@/utils/celebrations";

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
    Animated.timing(fade, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      if (mode === "dismiss") onDone();
      // For both Open and Share we navigate to /reveal without an
      // auto-action — /reveal renders its own Share button so the
      // user gets to see the rendered card before firing the share
      // sheet.
      else onOpenFull(undefined);
    });
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
  const geoTier = getGeoTier(myCountryCode, theirCountryCode);

  return (
    <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          styles.backdrop,
          { backgroundColor: colors.teal + "ee", opacity: fade },
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
              <Image source={{ uri: myPhotoUri }} style={styles.thumb} />
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
              {
                opacity: flagOpacity,
                transform: [{ scale: flagScale }],
              },
            ]}
          >
            {theirPhotoUri ? (
              <Image source={{ uri: theirPhotoUri }} style={styles.thumb} />
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

        <Text style={styles.country}>{theirCountry}</Text>

        <View style={styles.themePill}>
          <Text style={styles.themeEmoji}>{themeEmoji}</Text>
          <Text style={styles.themeText}>{themeTitle}</Text>
        </View>

        {/* Same Day / Same Country tier badges. Wrap so they reflow on
            narrow phones rather than overflowing horizontally. */}
        <View style={styles.tierRow}>
          <View style={styles.tierBadge}>
            <Text style={styles.tierEmoji}>{timeTier.emoji}</Text>
            <Text style={styles.tierText}>{timeTier.label}</Text>
          </View>
          <View style={styles.tierBadge}>
            <Text style={styles.tierEmoji}>{geoTier.emoji}</Text>
            <Text style={styles.tierText}>{geoTier.label}</Text>
          </View>
        </View>

        {/* Action pill row. Open is the primary CTA; Share is the
            secondary. Both are intentionally large — these are the
            two interactions that matter on this screen. The
            "Remove watermark" upsell now lives downstream on the
            /reveal share flow, so this row is short and punchy. */}
        <View style={styles.actionRow}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              finish("open");
            }}
            style={styles.openPill}
            accessibilityLabel="Open full match"
          >
            <Text style={styles.openText}>Open</Text>
            <Icon name="arrow-right" size={20} color="#001018" />
          </Pressable>

          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              // Open the full /reveal "It's a Match" page first instead of
              // jumping straight into the OS share sheet — users want a
              // chance to see the rendered card before deciding to share.
              // /reveal has its own Share button that fires the share flow.
              finish("share");
            }}
            style={styles.secondaryPill}
            accessibilityLabel="Share this match"
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
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 4,
    color: "rgba(0,16,24,0.55)",
    textTransform: "uppercase",
    marginBottom: 18,
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
    bottom: -6,
    right: -6,
    fontSize: 28,
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
    fontSize: 22,
    fontWeight: "800",
    color: "#001018",
    marginBottom: 12,
    textAlign: "center",
  },
  themePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,16,24,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: 12,
  },
  themeEmoji: {
    fontSize: 18,
  },
  themeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#001018",
  },
  tierRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginBottom: 22,
  },
  tierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.7)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tierEmoji: {
    fontSize: 14,
  },
  tierText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#001018",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 4,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  // Open + Share are intentionally large — roughly twice the previous
  // hit area so the two primary interactions on this screen are
  // unambiguous and easy to land with a thumb.
  openPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 32,
    paddingVertical: 20,
    borderRadius: 999,
  },
  openText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#001018",
    letterSpacing: 0.5,
  },
  secondaryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(0,16,24,0.55)",
    paddingHorizontal: 32,
    paddingVertical: 20,
    borderRadius: 999,
  },
  secondaryText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },
  hint: {
    marginTop: 18,
    fontSize: 11,
    color: "rgba(0,16,24,0.55)",
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});
