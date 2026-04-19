import React, { useCallback, useRef, useState } from "react";
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
import { SAMPLE_PHOTOS, getTodaysChallenge } from "@/data/samplePhotos";
import type { Match } from "@/context/AppContext";

const { width } = Dimensions.get("window");
const SWIPE_THRESHOLD = width * 0.28;

function getTheirPhoto(exclude?: string) {
  const pool = exclude
    ? SAMPLE_PHOTOS.filter((p) => p.uri !== exclude)
    : SAMPLE_PHOTOS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function SwipeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addMatch, streakCount, myPhotos } = useApp();
  const challenge = getTodaysChallenge();

  const getMyPhoto = () =>
    myPhotos.length > 0
      ? myPhotos[Math.floor(Math.random() * Math.min(myPhotos.length, 5))]
      : SAMPLE_PHOTOS[Math.floor(Math.random() * SAMPLE_PHOTOS.length)].uri;

  const [myPhotoUri, setMyPhotoUri] = useState(() => getMyPhoto());
  const [theirPhoto, setTheirPhoto] = useState(() => getTheirPhoto(myPhotoUri));
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  const pan = useRef(new Animated.ValueXY()).current;
  const cardScale = useRef(new Animated.Value(1)).current;
  const sameOpacity = useRef(new Animated.Value(0)).current;
  const diffOpacity = useRef(new Animated.Value(0)).current;

  const generateSimilarityScore = (v: "same" | "different") =>
    v === "same"
      ? Math.floor(Math.random() * 22) + 68
      : Math.floor(Math.random() * 35) + 25;

  const resetCard = useCallback(() => {
    const newMyUri = getMyPhoto();
    const newTheir = getTheirPhoto(newMyUri);
    setMyPhotoUri(newMyUri);
    setTheirPhoto(newTheir);
    pan.setValue({ x: 0, y: 0 });
    cardScale.setValue(1);
    sameOpacity.setValue(0);
    diffOpacity.setValue(0);
    setIsAnimatingOut(false);
  }, [myPhotos]);

  const handleSwipe = useCallback(
    (dir: "left" | "right") => {
      if (isAnimatingOut) return;
      setIsAnimatingOut(true);

      const v: "same" | "different" = dir === "right" ? "same" : "different";
      Haptics.impactAsync(
        v === "same"
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light
      );

      const score = generateSimilarityScore(v);
      const match: Match = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        myPhoto: myPhotoUri,
        theirPhoto: theirPhoto.uri,
        myCountry: "You",
        theirCountry: theirPhoto.country,
        theirCountryFlag: theirPhoto.countryFlag,
        theirCountryCode: theirPhoto.countryCode,
        similarityScore: score,
        verdict: v,
        timestamp: new Date().toISOString(),
        theme: challenge.id,
      };

      Animated.parallel([
        Animated.timing(pan.x, {
          toValue: dir === "right" ? width * 1.5 : -width * 1.5,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(cardScale, {
          toValue: 0.85,
          duration: 350,
          useNativeDriver: true,
        }),
      ]).start(() => {
        router.push({
          pathname: "/reveal",
          params: { matchData: JSON.stringify(match) },
        });
        setTimeout(resetCard, 400);
      });
    },
    [isAnimatingOut, myPhotoUri, theirPhoto, challenge, resetCard]
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
            tension: 120,
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
            {streakCount > 0 ? `${streakCount} in a row` : "Swipe to judge"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/camera")}
          style={[styles.cameraBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          <Feather name="camera" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={[styles.challengeBar, { borderColor: colors.border }]}>
        <Text style={styles.challengeEmoji}>{challenge.emoji}</Text>
        <Text style={[styles.challengeText, { color: colors.mutedForeground }]}>
          Today:{" "}
          <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
            {challenge.title}
          </Text>
        </Text>
        {hasUploadedPhoto && (
          <View style={[styles.uploadedBadge, { backgroundColor: colors.teal + "22" }]}>
            <Feather name="check" size={10} color={colors.teal} />
            <Text style={[styles.uploadedText, { color: colors.teal }]}>
              Your photo
            </Text>
          </View>
        )}
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
                  Somewhere in the world
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
            <Feather name="x" size={18} color={colors.primary} />
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
              Different
            </Text>
          </TouchableOpacity>

          <Text style={[styles.swipeInstruction, { color: colors.mutedForeground }]}>
            swipe or tap
          </Text>

          <TouchableOpacity
            style={[styles.hintBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => handleSwipe("right")}
            activeOpacity={0.8}
          >
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
              Same Same
            </Text>
            <Feather name="heart" size={18} color={colors.teal} />
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
