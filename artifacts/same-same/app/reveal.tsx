import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { CountryReveal } from "@/components/CountryReveal";
import { DAILY_CHALLENGES } from "@/data/samplePhotos";
import { timeAgo, simulatedPostedAt } from "@/utils/timeAgo";
import type { Match } from "@/context/AppContext";

const { width } = Dimensions.get("window");

export default function RevealScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { addMatch, matchedCountries } = useApp();
  const [match, setMatch] = useState<Match | null>(null);
  const savedRef = useRef(false);

  const fadeIn = useRef(new Animated.Value(0)).current;
  const scaleIn = useRef(new Animated.Value(0.92)).current;
  const sparklePulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (params.matchData) {
      try {
        const m = JSON.parse(params.matchData as string) as Match;
        setMatch(m);

        // Save the match immediately — every "Same Same" counts
        if (!savedRef.current) {
          savedRef.current = true;
          addMatch(m);
        }

        Animated.parallel([
          Animated.timing(fadeIn, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.spring(scaleIn, {
            toValue: 1,
            tension: 80,
            friction: 8,
            useNativeDriver: true,
          }),
        ]).start();

        Animated.loop(
          Animated.sequence([
            Animated.timing(sparklePulse, {
              toValue: 1,
              duration: 1100,
              useNativeDriver: true,
            }),
            Animated.timing(sparklePulse, {
              toValue: 0,
              duration: 1100,
              useNativeDriver: true,
            }),
          ])
        ).start();

        setTimeout(() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }, 400);
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.matchData]);

  const handleNext = () => {
    router.back();
  };

  if (!match) return null;

  const isNewCountry = !matchedCountries.some(
    (c) => c.code === match.theirCountryCode
  );

  // The special moment: same activity, within 24h
  const isSameDay = (match.theirPhotoMinutesAgo ?? 9999) < 1440;

  const themeMeta = DAILY_CHALLENGES.find((c) => c.id === match.theme);
  const themeTitle = themeMeta?.title ?? "the same thing";
  const themeEmoji = themeMeta?.emoji ?? "✨";

  const sparkleScale = sparklePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });
  const sparkleOpacity = sparklePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <TouchableOpacity
          onPress={handleNext}
          style={[styles.backBtn, { backgroundColor: colors.card }]}
        >
          <Icon name="x" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          It's a match
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomPadding + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {isSameDay && (
          <Animated.View
            style={[
              styles.sameDayBanner,
              {
                backgroundColor: colors.gold + "1f",
                borderColor: colors.gold,
                opacity: sparkleOpacity,
                transform: [{ scale: sparkleScale }],
              },
            ]}
          >
            <Text style={styles.sameDayEmoji}>✨</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sameDayTitle, { color: colors.gold }]}>
                Same Day Match
              </Text>
              <Text style={[styles.sameDaySub, { color: colors.foreground }]}>
                Both posted within 24 hours. Rare and beautiful.
              </Text>
            </View>
          </Animated.View>
        )}

        <Animated.View
          style={[
            styles.revealCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: fadeIn,
              transform: [{ scale: scaleIn }],
            },
          ]}
        >
          {isNewCountry && (
            <View style={[styles.newBadge, { backgroundColor: colors.primary }]}>
              <Icon name="star" size={12} color="#fff" />
              <Text style={styles.newBadgeText}>New country!</Text>
            </View>
          )}

          <View style={styles.themeRow}>
            <Text style={styles.themeEmoji}>{themeEmoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.themeLabel, { color: colors.mutedForeground }]}>
                You both shared
              </Text>
              <Text style={[styles.themeTitle, { color: colors.foreground }]}>
                {themeTitle}
              </Text>
            </View>
          </View>

          <View style={styles.photoPair}>
            <View style={styles.photoWrapper}>
              <Image
                source={{ uri: match.myPhoto }}
                style={styles.photo}
                resizeMode="cover"
              />
              <Text style={[styles.photoLabel, { color: colors.mutedForeground }]}>
                Your photo
              </Text>
              {match.myPhotoUploadedAt && (
                <Text style={[styles.photoLabelTime, { color: colors.mutedForeground }]}>
                  {timeAgo(new Date(match.myPhotoUploadedAt))}
                </Text>
              )}
            </View>
            <View style={[styles.vsBar, { backgroundColor: colors.border }]} />
            <View style={styles.photoWrapper}>
              <Image
                source={{ uri: match.theirPhoto }}
                style={styles.photo}
                resizeMode="cover"
              />
              <Text style={[styles.photoLabel, { color: colors.mutedForeground }]}>
                Their photo
              </Text>
              {match.theirPhotoMinutesAgo != null && (
                <Text style={[styles.photoLabelTime, { color: colors.mutedForeground }]}>
                  {timeAgo(simulatedPostedAt(match.theirPhotoMinutesAgo))}
                </Text>
              )}
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <CountryReveal
            leftCountry="Your Country"
            leftFlag="🌍"
            rightCountry={match.theirCountry}
            rightFlag={match.theirCountryFlag}
          />

          <View
            style={[
              styles.insightBox,
              { backgroundColor: colors.teal + "18", borderColor: colors.teal + "40" },
            ]}
          >
            <Icon name="heart" size={16} color={colors.teal} />
            <Text style={[styles.insightText, { color: colors.teal }]}>
              {isSameDay
                ? `Right now, you and someone in ${match.theirCountry} are both living this moment.`
                : `Across the world, someone in ${match.theirCountry} shared the same thing.`}
            </Text>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.statsRow,
            { opacity: fadeIn },
          ]}
        >
          <View style={[styles.statChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statNum, { color: colors.primary }]}>
              {matchedCountries.length}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              countries
            </Text>
          </View>
          <View style={[styles.statChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={styles.statEmoji}>{themeEmoji}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              {themeTitle.toLowerCase()}
            </Text>
          </View>
          <View style={[styles.statChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statNum, { color: isSameDay ? colors.gold : colors.teal }]}>
              {isSameDay ? "Today" : "Recent"}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              {isSameDay ? "same day" : "this week"}
            </Text>
          </View>
        </Animated.View>

        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: colors.primary }]}
          onPress={handleNext}
          activeOpacity={0.85}
        >
          <Text style={[styles.nextBtnText, { color: colors.primaryForeground }]}>
            Keep matching
          </Text>
          <Icon name="arrow-right" size={20} color={colors.primaryForeground} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const PHOTO_W = (width - 48 - 32 - 2) / 2;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 16,
  },
  sameDayBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  sameDayEmoji: { fontSize: 26 },
  sameDayTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sameDaySub: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  revealCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 18,
    overflow: "hidden",
  },
  newBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  newBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  themeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  themeEmoji: { fontSize: 28 },
  themeLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  themeTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  photoPair: {
    flexDirection: "row",
    gap: 1,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "stretch",
  },
  photoWrapper: {
    flex: 1,
    gap: 8,
  },
  photo: {
    width: "100%",
    height: 160,
    borderRadius: 12,
  },
  photoLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  photoLabelTime: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 2,
    opacity: 0.7,
  },
  vsBar: {
    width: 1,
    marginVertical: 0,
  },
  divider: {
    height: 1,
  },
  insightBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statChip: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
    gap: 4,
  },
  statNum: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  statEmoji: {
    fontSize: 22,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 56,
    borderRadius: 28,
  },
  nextBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
