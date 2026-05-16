import React, { useEffect, useState } from "react";
import {
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import type { EchoCard as EchoCardType } from "@/context/AppContext";
import { timeAgo } from "@/utils/timeAgo";

export default function EchoesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    pendingEchoes,
    mutualEchoes,
    markAllEchoesSeen,
    refreshEchoes,
    respondToEcho,
  } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [celebratingId, setCelebratingId] = useState<string | null>(null);

  // Pull fresh state on mount and clear the unread bell after a moment.
  useEffect(() => {
    refreshEchoes();
    const t = setTimeout(() => markAllEchoesSeen(), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshEchoes();
    setRefreshing(false);
  };

  const handleRespond = async (id: string, verdict: "same" | "different") => {
    Haptics.impactAsync(
      verdict === "same"
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    );
    const result = await respondToEcho(id, verdict);
    if (result === "mutual") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCelebratingId(id);
      setTimeout(() => setCelebratingId(null), 2500);
    }
  };

  const topPadding = Platform.OS === "web" ? 8 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 24 : insets.bottom + 24;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { borderColor: colors.border }]}
          hitSlop={8}
          accessibilityLabel="Back"
        >
          <Icon name="chevron-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Waves
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            Mutual moments with people elsewhere
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {pendingEchoes.length === 0 && mutualEchoes.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: colors.cardElevated },
              colors.shadows.sm,
            ]}
          >
            <View style={styles.emptyIconRow}>
              <View
                style={[
                  styles.emptyIconBadge,
                  { backgroundColor: colors.teal + "22", borderColor: colors.teal + "44" },
                ]}
              >
                <Icon name="ripple" size={22} color={colors.teal} />
              </View>
              <Icon name="arrow-right" size={16} color={colors.mutedForeground} />
              <View
                style={[
                  styles.emptyIconBadge,
                  { backgroundColor: colors.gold + "22", borderColor: colors.gold + "44" },
                ]}
              >
                <Icon name="wave-glyph" size={22} color={colors.gold} />
              </View>
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No waves yet
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              When someone sends you a ripple, you'll be asked here whether
              you feel the same back. If you do, that's a wave — a mutual
              moment between two minds.
            </Text>
          </View>
        ) : (
          <>
            {pendingEchoes.length > 0 && (
              <SectionHeader
                icon="ripple"
                iconColor={colors.teal}
                title="Waiting on you"
                subtitle="Someone sent you a ripple. Wave back if you feel the same."
              />
            )}
            {pendingEchoes.map((echo) => (
              <PendingEchoCard
                key={echo.id}
                echo={echo}
                onRespond={handleRespond}
                celebrating={celebratingId === echo.id}
              />
            ))}

            {mutualEchoes.length > 0 && (
              <SectionHeader
                icon="wave-glyph"
                iconColor={colors.gold}
                title="Your waves"
                subtitle="Two minds, one wavelength."
                spaceTop={pendingEchoes.length > 0}
              />
            )}
            {mutualEchoes.map((echo) => (
              <EchoListCard key={echo.id} echo={echo} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SectionHeader({
  title,
  subtitle,
  icon,
  iconColor,
  spaceTop,
}: {
  title: string;
  subtitle: string;
  icon?: "ripple" | "wave-glyph";
  iconColor?: string;
  spaceTop?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.sectionHeader, spaceTop && { marginTop: 18 }]}>
      <View style={styles.sectionTitleRow}>
        {icon ? (
          <Icon name={icon} size={16} color={iconColor ?? colors.teal} />
        ) : null}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          {title}
        </Text>
      </View>
      <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
        {subtitle}
      </Text>
    </View>
  );
}

function PendingEchoCard({
  echo,
  onRespond,
  celebrating,
}: {
  echo: EchoCardType;
  onRespond: (id: string, verdict: "same" | "different") => void;
  celebrating: boolean;
}) {
  const colors = useColors();
  const ago = timeAgo(new Date(echo.createdAt));
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.cardElevated,
          borderColor: celebrating ? colors.gold : colors.teal + "55",
        },
        celebrating ? colors.shadows.glowAccent : colors.shadows.sm,
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.bigFlag}>{echo.theirs.countryFlag}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.cardTitleRow}>
            <Icon name="ripple" size={14} color={colors.teal} />
            <Text
              style={[styles.cardTitle, { color: colors.foreground }]}
              numberOfLines={1}
            >
              Someone in {echo.theirs.country}
            </Text>
          </View>
          <View style={styles.cardSubRow}>
            <Icon name="ripple" size={12} color={colors.teal} />
            <Text
              style={[styles.cardSub, { color: colors.mutedForeground }]}
              numberOfLines={1}
            >
              sent you a ripple · {ago}
            </Text>
          </View>
        </View>
      </View>

      <PhotoPair mine={echo.mine} theirs={echo.theirs} />

      {celebrating ? (
        <View
          style={[
            styles.celebrateBanner,
            { borderColor: colors.gold + "55", backgroundColor: colors.gold + "1f" },
          ]}
        >
          <Icon name="wave-glyph" size={20} color={colors.gold} />
          <Text style={[styles.celebrateText, { color: colors.gold }]}>
            Wave! Two minds, one wavelength.
          </Text>
        </View>
      ) : (
        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={() => onRespond(echo.id, "different")}
            style={[
              styles.actionBtn,
              { borderColor: colors.border, backgroundColor: colors.background },
            ]}
            activeOpacity={0.85}
          >
            <Text style={[styles.actionLabel, { color: colors.foreground }]}>
              different
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onRespond(echo.id, "same")}
            style={[
              styles.actionBtn,
              styles.actionBtnPrimary,
              { backgroundColor: colors.teal },
            ]}
            activeOpacity={0.85}
          >
            <Icon name="wave-glyph" size={16} color="#001018" />
            <Text style={[styles.actionLabel, { color: "#001018" }]}>
              wave
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function EchoListCard({ echo }: { echo: EchoCardType }) {
  const colors = useColors();
  const stamp = echo.mutualAt ? new Date(echo.mutualAt) : new Date(echo.createdAt);
  const ago = timeAgo(stamp);
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() =>
        router.push({
          pathname: "/echo-pair",
          params: { a: echo.mine.id, b: echo.theirs.id },
        })
      }
      style={[
        styles.card,
        { backgroundColor: colors.cardElevated, borderColor: colors.border },
        colors.shadows.sm,
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.bigFlag}>{echo.theirs.countryFlag}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.cardTitleRow}>
            <Icon name="wave-glyph" size={14} color={colors.gold} />
            <Text
              style={[styles.cardTitle, { color: colors.foreground }]}
              numberOfLines={1}
            >
              You & someone in {echo.theirs.country}
            </Text>
          </View>
          <View style={styles.cardSubRow}>
            <Icon name="wave-glyph" size={12} color={colors.gold} />
            <Text
              style={[styles.cardSub, { color: colors.mutedForeground }]}
              numberOfLines={1}
            >
              wave · {ago}
            </Text>
          </View>
        </View>
        <Icon name="wave-glyph" size={20} color={colors.gold} />
      </View>
      <PhotoPair mine={echo.mine} theirs={echo.theirs} />
    </TouchableOpacity>
  );
}

function PhotoPair({
  mine,
  theirs,
}: {
  mine: EchoCardType["mine"];
  theirs: EchoCardType["theirs"];
}) {
  const colors = useColors();
  return (
    <View style={styles.photosRow}>
      <View style={styles.photoCol}>
        <Image source={{ uri: mine.uri }} style={styles.photo} />
        <Text style={[styles.photoLabel, { color: colors.mutedForeground }]}>
          yours
        </Text>
      </View>
      <Icon name="arrow-right" size={18} color={colors.mutedForeground} />
      <View style={styles.photoCol}>
        <Image source={{ uri: theirs.uri }} style={styles.photo} />
        <Text style={[styles.photoLabel, { color: colors.mutedForeground }]}>
          theirs
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  content: { paddingHorizontal: 16, gap: 14 },
  sectionHeader: {
    paddingHorizontal: 2,
    paddingBottom: 4,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  sectionSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  card: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bigFlag: { fontSize: 28 },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  cardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  cardSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
    minWidth: 0,
  },
  cardSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    flexShrink: 1,
  },
  photosRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  photoCol: { flex: 1, gap: 6, alignItems: "center" },
  photo: { width: "100%", aspectRatio: 1, borderRadius: 14 },
  photoLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  actionRow: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionBtnPrimary: { borderColor: "transparent" },
  actionLabel: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  celebrateBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  celebrateText: { fontSize: 12, fontFamily: "Inter_700Bold", flex: 1 },
  emptyCard: {
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    gap: 10,
    marginTop: 32,
  },
  emptyIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  emptyIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  emptyDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
  },
});
