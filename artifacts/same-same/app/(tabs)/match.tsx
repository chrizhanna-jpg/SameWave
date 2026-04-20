import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Icon } from "@/components/Icon";
import { MatchHearts } from "@/components/MatchHearts";
import { SemoLogo } from "@/components/SemoLogo";
import { expandToVibe } from "@/utils/interests";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  SAMPLE_PHOTOS,
  DAILY_CHALLENGES,
  getTodaysChallenge,
  getThemeChain,
  TAG_LIBRARY,
  generateSyntheticCandidates,
} from "@/data/samplePhotos";
import { timeAgo, simulatedPostedAt } from "@/utils/timeAgo";
import { getGeoTier } from "@/utils/celebrations";
import type { Match } from "@/context/AppContext";

const { width } = Dimensions.get("window");
const SWIPE_THRESHOLD = width * 0.28;

// Candidate scoring: shared tags weigh most, then same theme, then adjacent
// theme, then recency. Returns scored unseen candidates sorted high → low.
type Scored = {
  photo: typeof SAMPLE_PHOTOS[number];
  score: number;
  sharedTags: string[];
  inChain: boolean;
};

function scoreCandidates(
  preferredTheme: string,
  myTags: string[],
  excludeUris: string[]
): Scored[] {
  const chain = getThemeChain(preferredTheme);
  const chainIndex = (theme: string) => {
    const i = chain.indexOf(theme);
    return i === -1 ? -1 : i;
  };
  const myTagSet = new Set(myTags);

  // Dev/test builds blend in some synthetic candidates so users always see
  // fresh material even after the curated pool repeats. The generator is
  // hard-gated by ENABLE_SYNTHETIC_MATCHES (tied to __DEV__) and returns []
  // in production builds — real users only ship.
  const synthetic = generateSyntheticCandidates(preferredTheme, myTags, 8);
  const pool = [...SAMPLE_PHOTOS, ...synthetic];

  const candidates: Scored[] = pool
    .filter((p) => !excludeUris.includes(p.uri))
    .map((p) => {
      const sharedTags = p.tags.filter((t) => myTagSet.has(t));
      const idx = chainIndex(p.theme);
      const inChain = idx >= 0;
      const sameTheme = p.theme === preferredTheme;
      // Tag overlap dominates. Then theme match. Then adjacency depth.
      // Recency is a small tiebreaker — never the headline signal — so a
      // brand-new but totally unrelated photo can't outrank an older,
      // genuinely similar one.
      const score =
        sharedTags.length * 6 +
        (sameTheme ? 4 : 0) +
        (inChain && !sameTheme ? Math.max(0, 2 - idx * 0.6) : 0) +
        Math.max(0, 0.6 - p.minutesAgo / 4320); // up to +0.6, decays over 3 days
      return { photo: p, score, sharedTags, inChain };
    })
    // Hard floor: drop candidates with no tag overlap AND no theme/chain
    // relationship — those were the "nothing like my photo" matches.
    .filter((c) => c.sharedTags.length > 0 || c.inChain)
    .sort((a, b) => b.score - a.score);
  return candidates;
}

// Pick the next candidate. Prefers tag overlap, then same theme, then adjacent
// themes, then recency. Within the top tier, adds a touch of randomness so
// repeated swipes don't feel deterministic. Recycles when seen list exhausts.
function getTheirPhoto(
  preferredTheme: string,
  myTags: string[],
  excludeUris: string[] = [],
  currentUri?: string
): { photo: typeof SAMPLE_PHOTOS[number]; matchedTheme: string; sharedTags: string[] } {
  const pickFrom = (excl: string[]) => {
    const ranked = scoreCandidates(preferredTheme, myTags, excl);
    if (ranked.length === 0) return null;
    // Tight top-tier window (0.6 pts) so we only randomise between
    // genuinely-comparable matches, never reach for the next-best-thing.
    const topScore = ranked[0].score;
    const topTier = ranked.filter((c) => c.score >= topScore - 0.6).slice(0, 6);
    const pick = topTier[Math.floor(Math.random() * topTier.length)];
    return {
      photo: pick.photo,
      matchedTheme: pick.photo.theme,
      sharedTags: pick.sharedTags,
    };
  };

  const first = pickFrom(excludeUris);
  if (first && first.photo.uri !== currentUri) return first;
  // Exhausted (or got the same photo back) — recycle, excluding only the
  // current photo so we never repeat in place.
  const recycleExcl = currentUri ? [currentUri] : [];
  const recycled = pickFrom(recycleExcl);
  if (recycled && recycled.photo.uri !== currentUri) return recycled;
  // Last-ditch: prefer a photo from the same theme, then chain, then any.
  const chain = getThemeChain(preferredTheme);
  const fallback =
    SAMPLE_PHOTOS.find((p) => p.theme === preferredTheme && p.uri !== currentUri) ??
    SAMPLE_PHOTOS.find((p) => chain.includes(p.theme) && p.uri !== currentUri) ??
    SAMPLE_PHOTOS.find((p) => p.uri !== currentUri) ??
    SAMPLE_PHOTOS[0];
  return {
    photo: fallback,
    matchedTheme: fallback.theme,
    sharedTags: fallback.tags.filter((t) => myTags.includes(t)),
  };
}

export default function SwipeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { streakCount, myPhotos, addMatch } = useApp();
  const todaysChallenge = getTodaysChallenge();

  // User's photo is LOCKED for the session — only changes when they upload a new one
  const myPhotoData = React.useMemo<{ uri: string; uploadedAt: string; theme: string; tags: string[] }>(() => {
    if (myPhotos.length > 0) {
      const p = myPhotos[0];
      return {
        uri: p.uri,
        uploadedAt: p.uploadedAt,
        theme: p.theme,
        tags: p.tags ?? [],
      };
    }
    const sample = SAMPLE_PHOTOS[0];
    return {
      uri: sample.uri,
      uploadedAt: simulatedPostedAt(5).toISOString(),
      theme: sample.theme,
      tags: sample.tags,
    };
  }, [myPhotos]);

  const myPhotoUri = myPhotoData.uri;
  const activeTheme = myPhotoData.theme;
  const myTags = myPhotoData.tags;
  // The user's theme is freeform — find a matching daily challenge for the
  // emoji if possible, otherwise default to ✨ and show the raw theme text.
  const themeMeta = DAILY_CHALLENGES.find(
    (c) => c.id === activeTheme || c.title.toLowerCase() === activeTheme,
  );
  const themeEmoji = themeMeta?.emoji ?? "✨";
  const themeTitle = themeMeta?.title ?? activeTheme;

  // Stable signature of the user's tag list — included in deps so re-uploading
  // the same URI/theme but with different tags re-seeds the candidate pool.
  const myTagsKey = React.useMemo(() => [...myTags].sort().join("|"), [myTags]);

  const seenRef = useRef<string[]>([myPhotoUri]);
  const initial = React.useMemo(
    () => getTheirPhoto(activeTheme, myTags, [myPhotoUri]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [theirPhoto, setTheirPhoto] = useState(initial.photo);
  const [matchedTheme, setMatchedTheme] = useState<string>(initial.matchedTheme);
  const [sharedTags, setSharedTags] = useState<string[]>(initial.sharedTags);
  const [fullscreenUri, setFullscreenUri] = useState<string | null>(null);

  // Refs mirror state so callbacks stay stable and read latest values
  // without triggering re-creation (which previously caused stale closures
  // inside in-flight Animated callbacks → "stuck on same photo").
  const theirPhotoRef = useRef(theirPhoto);
  theirPhotoRef.current = theirPhoto;
  const activeThemeRef = useRef(activeTheme);
  activeThemeRef.current = activeTheme;
  const myTagsRef = useRef(myTags);
  myTagsRef.current = myTags;
  const myPhotoUriRef = useRef(myPhotoUri);
  myPhotoUriRef.current = myPhotoUri;
  const isAnimatingOutRef = useRef(false);

  const pan = useRef(new Animated.ValueXY()).current;
  const cardScale = useRef(new Animated.Value(1)).current;
  const sameOpacity = useRef(new Animated.Value(0)).current;

  // When the user uploads a new photo (which may carry a new theme/tags),
  // reset the candidate pool so we immediately match against the new context.
  useEffect(() => {
    seenRef.current = [myPhotoUri];
    const next = getTheirPhoto(activeTheme, myTags, [myPhotoUri]);
    setTheirPhoto(next.photo);
    setMatchedTheme(next.matchedTheme);
    setSharedTags(next.sharedTags);
    isAnimatingOutRef.current = false;
    pan.setValue({ x: 0, y: 0 });
    cardScale.setValue(1);
    sameOpacity.setValue(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPhotoUri, activeTheme, myTagsKey]);

  const loadNextCandidate = useCallback(() => {
    const currentUri = theirPhotoRef.current.uri;
    seenRef.current.push(currentUri);
    if (seenRef.current.length > 30) seenRef.current = seenRef.current.slice(-15);
    const next = getTheirPhoto(
      activeThemeRef.current,
      myTagsRef.current,
      seenRef.current,
      currentUri,
    );
    // After the swipe-out animation, the native-driven transform is parked
    // off-screen. Calling setValue from JS does NOT reliably propagate back
    // through useNativeDriver — the card stays invisible on subsequent taps.
    // Use a 0-duration animation so the native driver itself performs the
    // reset, then update photo state.
    sameOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(pan, {
        toValue: { x: 0, y: 0 },
        duration: 0,
        useNativeDriver: true,
      }),
      Animated.timing(cardScale, {
        toValue: 1,
        duration: 0,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTheirPhoto(next.photo);
      setMatchedTheme(next.matchedTheme);
      setSharedTags(next.sharedTags);
      isAnimatingOutRef.current = false;
    });
  }, [pan, cardScale, sameOpacity]);

  const handleSwipe = useCallback(
    (dir: "left" | "right") => {
      if (isAnimatingOutRef.current) return;
      isAnimatingOutRef.current = true;

      Haptics.impactAsync(
        dir === "right"
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light
      );

      // Snapshot the current photo so a re-render mid-animation can't
      // change what we navigate to.
      const snapshotPhoto = theirPhotoRef.current;
      const snapshotShared = sharedTags;
      const snapshotMyUri = myPhotoUriRef.current;
      const snapshotTheme = activeThemeRef.current;
      const snapshotMyUploadedAt = myPhotoData.uploadedAt;

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
        // Build a match record for BOTH verdicts so the user can revisit
        // and flip a previous swipe from My Journey. Stats / countries /
        // badges only count "same" — the context handles that branching.
        const match: Match = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          myPhoto: snapshotMyUri,
          theirPhoto: snapshotPhoto.uri,
          myCountry: "You",
          theirCountry: snapshotPhoto.country,
          theirCountryFlag: snapshotPhoto.countryFlag,
          theirCountryCode: snapshotPhoto.countryCode,
          similarityScore: 0,
          verdict: dir === "right" ? "same" : "different",
          timestamp: new Date().toISOString(),
          theme: snapshotTheme,
          theirPhotoMinutesAgo: snapshotPhoto.minutesAgo,
          myPhotoUploadedAt: snapshotMyUploadedAt,
          sharedTags: snapshotShared,
          theirVibe: expandToVibe(snapshotPhoto.tags ?? [], snapshotPhoto.uri),
        };
        addMatch(match);
        if (dir === "right") {
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
    [sharedTags, myPhotoData.uploadedAt, pan.x, cardScale, loadNextCandidate, addMatch]
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
          <SemoLogo
            size="sm"
            color={colors.foreground}
            taglineColor={colors.mutedForeground}
          />
          <Text style={[styles.subtitle, { color: colors.mutedForeground, marginTop: 4 }]}>
            {streakCount > 0 ? `${streakCount} matches` : "Find your similar"}
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
        <Text style={styles.challengeEmoji}>{themeEmoji}</Text>
        <Text style={[styles.challengeText, { color: colors.mutedForeground }]}>
          Matching:{" "}
          <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
            {themeTitle}
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
            <Pressable
              style={styles.photoSection}
              onPress={() => setFullscreenUri(myPhotoUri)}
            >
              <Image
                source={{ uri: myPhotoUri }}
                style={styles.fillPhoto}
                resizeMode="cover"
              />
              <View style={[styles.photoTag, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
                <Text style={[styles.photoTagText, { color: "#fff" }]}>
                  {hasUploadedPhoto ? "Your photo" : "Your moment"}
                </Text>
                <Text style={[styles.photoTagTime, { color: "rgba(255,255,255,0.75)" }]}>
                  {timeAgo(new Date(myPhotoData.uploadedAt))}
                </Text>
              </View>
              <View style={[styles.expandHint, { backgroundColor: "rgba(0,0,0,0.45)" }]}>
                <Icon name="maximize" size={12} color="#fff" />
              </View>
            </Pressable>

            <View style={[styles.divider, { backgroundColor: colors.card }]}>
              <View style={[styles.vsChip, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.vsText, { color: colors.mutedForeground }]}>
                  vs
                </Text>
              </View>
            </View>

            <Pressable
              style={styles.photoSection}
              onPress={() => setFullscreenUri(theirPhoto.uri)}
            >
              <Image
                source={{ uri: theirPhoto.uri }}
                style={styles.fillPhoto}
                resizeMode="cover"
              />
              <View
                style={[
                  styles.photoTag,
                  styles.photoTagLifted,
                  { backgroundColor: "rgba(0,0,0,0.55)" },
                ]}
              >
                <Text style={[styles.photoTagText, { color: "#fff" }]}>
                  {/* Hint at distance without spoiling the country reveal.
                      Without device location this lands at "Same Planet"; once
                      we have geolocation it can become Same Continent / Country. */}
                  {getGeoTier(undefined, theirPhoto.countryCode).emoji}{" "}
                  {getGeoTier(undefined, theirPhoto.countryCode).label.toLowerCase()}
                </Text>
                <Text style={[styles.photoTagTime, { color: "rgba(255,255,255,0.75)" }]}>
                  {timeAgo(simulatedPostedAt(theirPhoto.minutesAgo))}
                </Text>
              </View>
              <View style={[styles.expandHint, { backgroundColor: "rgba(0,0,0,0.45)" }]}>
                <Icon name="maximize" size={12} color="#fff" />
              </View>
              {sharedTags.length > 0 && (
                <View style={[styles.sharedTagsChip, { backgroundColor: colors.teal + "f2" }]}>
                  <Text style={styles.sharedTagsLabel}>Both have</Text>
                  <Text style={styles.sharedTagsValue}>
                    {sharedTags
                      .slice(0, 3)
                      .map((id) => {
                        const t = TAG_LIBRARY.find((x) => x.id === id);
                        return t ? `${t.emoji} ${t.label}` : id;
                      })
                      .join("  ·  ")}
                  </Text>
                </View>
              )}
            </Pressable>

            {/* Floating action buttons overlaid on the bottom of the card */}
            <View
              style={[
                styles.actionOverlay,
                { paddingBottom: 14 },
              ]}
              pointerEvents="box-none"
            >
              <TouchableOpacity
                style={[styles.actionBtn, styles.skipBtn]}
                onPress={() => handleSwipe("left")}
                activeOpacity={0.8}
                accessibilityLabel="Skip"
              >
                <Icon name="x" size={26} color="#fff" />
              </TouchableOpacity>

              <View style={{ flex: 1 }} pointerEvents="none" />

              <TouchableOpacity
                style={[styles.actionBtn, styles.matchBtn, { backgroundColor: colors.teal }]}
                onPress={() => handleSwipe("right")}
                activeOpacity={0.85}
                accessibilityLabel="Same Same"
              >
                <MatchHearts size={30} color="#001018" />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>

      {/* Fullscreen image viewer */}
      <Modal
        visible={fullscreenUri !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFullscreenUri(null)}
      >
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Pressable
          style={styles.fullscreenBackdrop}
          onPress={() => setFullscreenUri(null)}
        >
          {fullscreenUri && (
            <Image
              source={{ uri: fullscreenUri }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
          <TouchableOpacity
            onPress={() => setFullscreenUri(null)}
            style={[styles.fullscreenClose, { top: insets.top + 12 }]}
            activeOpacity={0.85}
            accessibilityLabel="Close"
          >
            <Icon name="x" size={22} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Modal>

      <View style={{ paddingBottom: bottomPadding }} />
    </View>
  );
}

const CARD_WIDTH = width - 24;

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
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === "web" ? 90 : 70,
  },
  cardWrapper: {
    width: CARD_WIDTH,
    flex: 1,
  },
  card: {
    width: CARD_WIDTH,
    flex: 1,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    position: "relative",
  },
  photoSection: {
    position: "relative",
    flex: 1,
  },
  fillPhoto: {
    width: "100%",
    height: "100%",
  },
  photoTag: {
    position: "absolute",
    bottom: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  photoTagLifted: {
    bottom: 84, // clear of the bottom action buttons
  },
  expandHint: {
    position: "absolute",
    top: 10,
    left: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  actionOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  actionBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  skipBtn: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  matchBtn: {
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  swipeHintPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
  },
  swipeHintText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 0.3,
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.97)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenImage: {
    width: "100%",
    height: "100%",
  },
  fullscreenClose: {
    position: "absolute",
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
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
  sharedTagsChip: {
    position: "absolute",
    top: 8,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    maxWidth: "70%",
  },
  sharedTagsLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "#001018",
    opacity: 0.7,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  sharedTagsValue: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#001018",
    marginTop: 1,
  },
  divider: {
    position: "absolute",
    top: "50%",
    marginTop: -14,
    left: 0,
    right: 0,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
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
