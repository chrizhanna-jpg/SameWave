import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Icon } from "@/components/Icon";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  SAMPLE_PHOTOS,
  DAILY_CHALLENGES,
  getTodaysChallenge,
  getThemeChain,
} from "@/data/samplePhotos";
import { timeAgo, simulatedPostedAt } from "@/utils/timeAgo";
import type { Match } from "@/context/AppContext";

const { width } = Dimensions.get("window");
const SWIPE_THRESHOLD = width * 0.28;

// Pick the next candidate, walking the theme chain (preferred theme first,
// then adjacent themes) until we find an unseen photo. Within a theme, prefer
// the most recently-posted photo so same-day matches surface first.
type Candidate = { photo: typeof SAMPLE_PHOTOS[number]; matchedTheme: string } | null;

function pickFromChain(
  preferredTheme: string,
  excludeUris: string[]
): Candidate {
  const chain = getThemeChain(preferredTheme);
  for (const theme of chain) {
    const pool = SAMPLE_PHOTOS.filter(
      (p) => p.theme === theme && !excludeUris.includes(p.uri)
    );
    if (pool.length === 0) continue;
    pool.sort((a, b) => a.minutesAgo - b.minutesAgo);
    const top = pool.slice(0, Math.min(3, pool.length));
    const pick = top[Math.floor(Math.random() * top.length)];
    return { photo: pick, matchedTheme: theme };
  }
  return null;
}

// Pick the next candidate, walking the theme chain (preferred theme first,
// then adjacent themes) until we find an unseen photo. Within a theme, prefer
// the most recently-posted photo so same-day matches surface first.
// When the seen pool is exhausted, recycle (keeping current candidate excluded
// so we never repeat back-to-back).
function getTheirPhoto(
  preferredTheme: string,
  excludeUris: string[] = []
): { photo: typeof SAMPLE_PHOTOS[number]; matchedTheme: string } {
  const first = pickFromChain(preferredTheme, excludeUris);
  if (first) return first;
  // Exhausted: keep only the very latest (current candidate) excluded
  // so the user doesn't see the exact same photo twice in a row.
  const minimalExclude = excludeUris.slice(-1);
  const recycled = pickFromChain(preferredTheme, minimalExclude);
  if (recycled) return recycled;
  // True last resort.
  return { photo: SAMPLE_PHOTOS[0], matchedTheme: SAMPLE_PHOTOS[0].theme };
}

export default function SwipeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { streakCount, myPhotos } = useApp();
  const todaysChallenge = getTodaysChallenge();

  // User's photo is LOCKED for the session — only changes when they upload a new one
  const myPhotoData = React.useMemo<{ uri: string; uploadedAt: string; theme: string }>(() => {
    if (myPhotos.length > 0) return myPhotos[0];
    const sample = SAMPLE_PHOTOS[0];
    return {
      uri: sample.uri,
      uploadedAt: simulatedPostedAt(5).toISOString(),
      theme: sample.theme,
    };
  }, [myPhotos]);

  const myPhotoUri = myPhotoData.uri;
  const activeTheme = myPhotoData.theme;
  const themeMeta =
    DAILY_CHALLENGES.find((c) => c.id === activeTheme) ?? todaysChallenge;

  const seenRef = useRef<string[]>([myPhotoUri]);
  const initial = React.useMemo(
    () => getTheirPhoto(activeTheme, [myPhotoUri]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [theirPhoto, setTheirPhoto] = useState(initial.photo);
  const [matchedTheme, setMatchedTheme] = useState<string>(initial.matchedTheme);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  // When the user uploads a new photo (which may carry a new theme),
  // reset the candidate pool so we immediately match against the new theme.
  useEffect(() => {
    seenRef.current = [myPhotoUri];
    const next = getTheirPhoto(activeTheme, [myPhotoUri]);
    setTheirPhoto(next.photo);
    setMatchedTheme(next.matchedTheme);
    setIsAnimatingOut(false);
  }, [myPhotoUri, activeTheme]);

  const pan = useRef(new Animated.ValueXY()).current;
  const cardScale = useRef(new Animated.Value(1)).current;
  const sameOpacity = useRef(new Animated.Value(0)).current;

  const loadNextCandidate = useCallback(() => {
    seenRef.current.push(theirPhoto.uri);
    if (seenRef.current.length > 30) seenRef.current = seenRef.current.slice(-15);
    const next = getTheirPhoto(activeTheme, seenRef.current);
    // If we've cycled back through everything, trim seen so the recycle
    // doesn't keep firing on every swipe.
    if (next.photo.uri === theirPhoto.uri || seenRef.current.includes(next.photo.uri)) {
      seenRef.current = [myPhotoUri, theirPhoto.uri];
    }
    setTheirPhoto(next.photo);
    setMatchedTheme(next.matchedTheme);
    pan.setValue({ x: 0, y: 0 });
    cardScale.setValue(1);
    sameOpacity.setValue(0);
    setIsAnimatingOut(false);
  }, [theirPhoto.uri, activeTheme, myPhotoUri, pan, cardScale, sameOpacity]);

  const handleSwipe = useCallback(
    (dir: "left" | "right") => {
      if (isAnimatingOut) return;
      setIsAnimatingOut(true);

      Haptics.impactAsync(
        dir === "right"
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light
      );

      Animated.parallel([
        Animated.timing(pan.x, {
          toValue: dir === "right" ? width * 1.5 : -width * 1.5,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(cardScale, {
          toValue: 0.9,
          duration: 320,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (dir === "right") {
          // It's a match! Build the match record and reveal.
          const match: Match = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            myPhoto: myPhotoUri,
            theirPhoto: theirPhoto.uri,
            myCountry: "You",
            theirCountry: theirPhoto.country,
            theirCountryFlag: theirPhoto.countryFlag,
            theirCountryCode: theirPhoto.countryCode,
            similarityScore: 0,
            verdict: "same",
            timestamp: new Date().toISOString(),
            theme: matchedTheme,
            theirPhotoMinutesAgo: theirPhoto.minutesAgo,
            myPhotoUploadedAt: myPhotoData.uploadedAt,
          };
          router.push({
            pathname: "/reveal",
            params: { matchData: JSON.stringify(match) },
          });
          // Prepare next candidate behind the modal
          setTimeout(loadNextCandidate, 400);
        } else {
          // "Different" — silently move on, keep user's photo locked
          loadNextCandidate();
        }
      });
    },
    [
      isAnimatingOut,
      myPhotoUri,
      theirPhoto,
      matchedTheme,
      myPhotoData.uploadedAt,
      pan.x,
      cardScale,
      loadNextCandidate,
    ]
  );

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dy) < 80,
      onPanResponderMove: (_, g) => {
        pan.setValue({ x: g.dx, y: g.dy * 0.08 });
        const progress = Math.abs(g.dx) / SWIPE_THRESHOLD;
        if (g.dx > 0) {
          sameOpacity.setValue(Math.min(progress, 1));
        } else {
          sameOpacity.setValue(0);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) {
          handleSwipe("right");
        } else if (g.dx < -SWIPE_THRESHOLD) {
          handleSwipe("left");
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            tension: 120,
            friction: 8,
          }).start();
          sameOpacity.setValue(0);
        }
      },
    })
  ).current;

  const rotation = pan.x.interpolate({
    inputRange: [-width / 2, 0, width / 2],
    outputRange: ["-7deg", "0deg", "7deg"],
    extrapolate: "clamp",
  });

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;
  const hasUploadedPhoto = myPhotos.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <View>
          <Text style={[styles.appTitle, { color: colors.foreground }]}>
            Same Same
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {streakCount > 0 ? `${streakCount} matches` : "Find your same"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/camera")}
          style={[styles.cameraBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          <Icon name="camera" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={[styles.challengeBar, { borderColor: colors.border }]}>
        <Text style={styles.challengeEmoji}>{themeMeta.emoji}</Text>
        <Text style={[styles.challengeText, { color: colors.mutedForeground }]}>
          Matching:{" "}
          <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
            {themeMeta.title}
          </Text>
        </Text>
        {hasUploadedPhoto && (
          <View style={[styles.uploadedBadge, { backgroundColor: colors.teal + "22" }]}>
            <Icon name="check" size={10} color={colors.teal} />
            <Text style={[styles.uploadedText, { color: colors.teal }]}>
              Your photo
            </Text>
          </View>
        )}
      </View>

      {matchedTheme !== activeTheme && (() => {
        const nearby = DAILY_CHALLENGES.find((c) => c.id === matchedTheme);
        if (!nearby) return null;
        return (
          <View style={[styles.nearbyBar, { backgroundColor: colors.gold + "1a", borderColor: colors.gold + "55" }]}>
            <Text style={styles.nearbyEmoji}>{nearby.emoji}</Text>
            <Text style={[styles.nearbyText, { color: colors.foreground }]}>
              Trying nearby:{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>{nearby.title}</Text>
            </Text>
          </View>
        );
      })()}

      <View style={styles.cardArea}>
        <Animated.View
          style={[
            styles.cardWrapper,
            {
              transform: [
                { translateX: pan.x },
                { translateY: pan.y },
                { rotate: rotation },
                { scale: cardScale },
              ],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <Animated.View
            style={[
              styles.sameLabel,
              { opacity: sameOpacity, borderColor: colors.teal },
            ]}
          >
            <Text style={[styles.labelText, { color: colors.teal }]}>
              SAME SAME
            </Text>
          </Animated.View>

          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.photoSection}>
              <Image
                source={{ uri: myPhotoUri }}
                style={styles.topPhoto}
                resizeMode="cover"
              />
              <View style={[styles.photoTag, { backgroundColor: colors.background + "cc" }]}>
                <Text style={[styles.photoTagText, { color: colors.foreground }]}>
                  {hasUploadedPhoto ? "Your photo" : "Your moment"}
                </Text>
                <Text style={[styles.photoTagTime, { color: colors.mutedForeground }]}>
                  {timeAgo(new Date(myPhotoData.uploadedAt))}
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.background }]}>
              <View style={[styles.vsChip, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.vsText, { color: colors.mutedForeground }]}>
                  vs
                </Text>
              </View>
            </View>

            <View style={styles.photoSection}>
              <Image
                source={{ uri: theirPhoto.uri }}
                style={styles.bottomPhoto}
                resizeMode="cover"
              />
              <View style={[styles.photoTag, { backgroundColor: colors.background + "cc" }]}>
                <Text style={[styles.photoTagText, { color: colors.foreground }]}>
                  somewhere in the world
                </Text>
                <Text style={[styles.photoTagTime, { color: colors.mutedForeground }]}>
                  {timeAgo(simulatedPostedAt(theirPhoto.minutesAgo))}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </View>

      <View style={[styles.swipeHint, { paddingBottom: bottomPadding + 8 }]}>
        <View style={styles.hintRow}>
          <TouchableOpacity
            style={[styles.hintBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => handleSwipe("left")}
            activeOpacity={0.8}
          >
            <Icon name="x" size={18} color={colors.mutedForeground} />
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
              Skip
            </Text>
          </TouchableOpacity>

          <Text style={[styles.swipeInstruction, { color: colors.mutedForeground }]}>
            swipe right to match
          </Text>

          <TouchableOpacity
            style={[styles.hintBtn, { backgroundColor: colors.teal + "18", borderColor: colors.teal }]}
            onPress={() => handleSwipe("right")}
            activeOpacity={0.8}
          >
            <Text style={[styles.hintText, { color: colors.teal }]}>
              Same Same
            </Text>
            <Icon name="heart" size={18} color={colors.teal} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const CARD_WIDTH = width - 40;
const PHOTO_HEIGHT = Math.min((CARD_WIDTH * 0.55), 200);

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  appTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  cameraBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  challengeBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
    borderBottomWidth: 0,
  },
  challengeEmoji: { fontSize: 15 },
  challengeText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  uploadedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  uploadedText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  nearbyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  nearbyEmoji: { fontSize: 14 },
  nearbyText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  cardArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  cardWrapper: {
    width: CARD_WIDTH,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
  },
  photoSection: {
    position: "relative",
  },
  topPhoto: {
    width: "100%",
    height: PHOTO_HEIGHT,
  },
  bottomPhoto: {
    width: "100%",
    height: PHOTO_HEIGHT,
  },
  photoTag: {
    position: "absolute",
    bottom: 8,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  photoTagText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  photoTagTime: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  divider: {
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  vsChip: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 12,
  },
  vsText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  sameLabel: {
    position: "absolute",
    top: 20,
    right: 20,
    zIndex: 10,
    borderWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    transform: [{ rotate: "12deg" }],
  },
  labelText: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  swipeHint: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  hintBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
  },
  hintText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  swipeInstruction: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
