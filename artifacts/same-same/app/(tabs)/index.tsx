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
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { getRandomPair, getTodaysChallenge } from "@/data/samplePhotos";
import type { Match } from "@/context/AppContext";

const { width, height } = Dimensions.get("window");
const SWIPE_THRESHOLD = width * 0.3;

export default function SwipeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addMatch, matches, totalMatches, streakCount } = useApp();

  const [pair, setPair] = useState(() => getRandomPair());
  const [isRevealing, setIsRevealing] = useState(false);
  const [verdict, setVerdict] = useState<"same" | "different" | null>(null);
  const [pendingMatch, setPendingMatch] = useState<Match | null>(null);

  const pan = useRef(new Animated.ValueXY()).current;
  const cardScale = useRef(new Animated.Value(1)).current;
  const sameOpacity = useRef(new Animated.Value(0)).current;
  const diffOpacity = useRef(new Animated.Value(0)).current;
  const revealOpacity = useRef(new Animated.Value(0)).current;

  const challenge = getTodaysChallenge();

  const generateSimilarityScore = (verdict: "same" | "different") => {
    if (verdict === "same") {
      return Math.floor(Math.random() * 20) + 70;
    }
    return Math.floor(Math.random() * 30) + 30;
  };

  const handleSwipe = useCallback(
    async (dir: "left" | "right") => {
      if (isRevealing) return;

      const v: "same" | "different" = dir === "right" ? "same" : "different";
      setVerdict(v);
      setIsRevealing(true);

      Haptics.impactAsync(
        v === "same"
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light
      );

      const score = generateSimilarityScore(v);
      const match: Match = {
        id: Date.now().toString(),
        myPhoto: pair[0].uri,
        theirPhoto: pair[1].uri,
        myCountry: "Your Country",
        theirCountry: pair[1].country,
        theirCountryFlag: pair[1].countryFlag,
        theirCountryCode: pair[1].countryCode,
        similarityScore: score,
        verdict: v,
        timestamp: new Date().toISOString(),
        theme: challenge.id,
      };

      setPendingMatch(match);

      await Animated.parallel([
        Animated.timing(pan.x, {
          toValue: dir === "right" ? width * 1.5 : -width * 1.5,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(cardScale, {
          toValue: 0.8,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start(() => {});

      setTimeout(() => {
        router.push({
          pathname: "/reveal",
          params: {
            matchData: JSON.stringify(match),
          },
        });
      }, 100);
    },
    [isRevealing, pair, challenge]
  );

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 10 && Math.abs(g.dy) < 60,
      onPanResponderMove: (_, g) => {
        pan.setValue({ x: g.dx, y: g.dy * 0.1 });

        const progress = Math.abs(g.dx) / SWIPE_THRESHOLD;
        if (g.dx > 0) {
          sameOpacity.setValue(Math.min(progress, 1));
          diffOpacity.setValue(0);
        } else {
          diffOpacity.setValue(Math.min(progress, 1));
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
            tension: 100,
            friction: 8,
          }).start();
          sameOpacity.setValue(0);
          diffOpacity.setValue(0);
        }
      },
    })
  ).current;

  const rotation = pan.x.interpolate({
    inputRange: [-width / 2, 0, width / 2],
    outputRange: ["-8deg", "0deg", "8deg"],
    extrapolate: "clamp",
  });

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const resetForNextPair = () => {
    pan.setValue({ x: 0, y: 0 });
    cardScale.setValue(1);
    sameOpacity.setValue(0);
    diffOpacity.setValue(0);
    setIsRevealing(false);
    setVerdict(null);
    setPendingMatch(null);
    setPair(getRandomPair());
  };

  useEffect(() => {
    const unsubscribe = router.subscribe?.(() => {
      resetForNextPair();
    });
    return () => unsubscribe?.();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <View>
          <Text style={[styles.appTitle, { color: colors.foreground }]}>
            Same Same
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {streakCount > 0 ? `${streakCount} match streak` : "Swipe to match"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/camera")}
          style={[styles.cameraBtn, { backgroundColor: colors.primary }]}
        >
          <Feather name="camera" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.challengeBar}>
        <Text style={[styles.challengeEmoji]}>{challenge.emoji}</Text>
        <Text style={[styles.challengeText, { color: colors.mutedForeground }]}>
          Today: <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{challenge.title}</Text>
        </Text>
      </View>

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
          <Animated.View
            style={[
              styles.diffLabel,
              { opacity: diffOpacity, borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.labelText, { color: colors.primary }]}>
              DIFFERENT
            </Text>
          </Animated.View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Image
              source={{ uri: pair[0].uri }}
              style={styles.topPhoto}
              resizeMode="cover"
            />
            <View style={[styles.divider, { backgroundColor: colors.background }]}>
              <View style={[styles.vsChip, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.vsText, { color: colors.mutedForeground }]}>
                  vs
                </Text>
              </View>
            </View>
            <Image
              source={{ uri: pair[1].uri }}
              style={styles.bottomPhoto}
              resizeMode="cover"
            />
          </View>
        </Animated.View>
      </View>

      <View style={[styles.swipeHint, { paddingBottom: bottomPadding + 8 }]}>
        <View style={styles.hintRow}>
          <View style={[styles.hintChip, { backgroundColor: colors.card }]}>
            <Feather name="arrow-left" size={16} color={colors.primary} />
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
              Different
            </Text>
          </View>
          <Text style={[styles.swipeInstruction, { color: colors.mutedForeground }]}>
            Swipe to judge
          </Text>
          <View style={[styles.hintChip, { backgroundColor: colors.card }]}>
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
              Same Same
            </Text>
            <Feather name="arrow-right" size={16} color={colors.teal} />
          </View>
        </View>
      </View>
    </View>
  );
}

const CARD_WIDTH = width - 48;
const PHOTO_HEIGHT = (CARD_WIDTH / 2) - 8;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    paddingBottom: 12,
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
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 8,
  },
  challengeEmoji: {
    fontSize: 16,
  },
  challengeText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  cardArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardWrapper: {
    width: CARD_WIDTH,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
  },
  topPhoto: {
    width: "100%",
    height: Math.min(PHOTO_HEIGHT, 180),
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
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  bottomPhoto: {
    width: "100%",
    height: Math.min(PHOTO_HEIGHT, 180),
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
  diffLabel: {
    position: "absolute",
    top: 20,
    left: 20,
    zIndex: 10,
    borderWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    transform: [{ rotate: "-12deg" }],
  },
  labelText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  swipeHint: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hintChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  hintText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  swipeInstruction: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
