import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { MicBadge } from "@/components/MicBadge";
import { useColors } from "@/hooks/useColors";
import { fetchPair, type PhotoPairResult, type PhotoPairSide } from "@/utils/api";

// Friendly relative timestamp ("just now", "3h ago", "yesterday",
// "Apr 12") — matches the wording used throughout the rest of the app.
function ago(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function EchoPairScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ a?: string; b?: string }>();
  const [pair, setPair] = useState<PhotoPairResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!params.a || !params.b) {
        setLoading(false);
        return;
      }
      const result = await fetchPair(String(params.a), String(params.b));
      if (alive) {
        setPair(result);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [params.a, params.b]);

  const sharedTags = useMemo(() => {
    if (!pair) return [];
    const set = new Set(pair.b.tags);
    return pair.a.tags.filter((t) => set.has(t));
  }, [pair]);

  const onShare = async () => {
    if (!pair) return;
    const themeLine = pair.a.theme || pair.b.theme || "shared moment";
    const message = `Two strangers, same vibe — ${themeLine}. ${pair.a.country} ${pair.a.countryFlag} ↔ ${pair.b.country} ${pair.b.countryFlag}. Found on Echo.`;
    try {
      await Share.share({ message });
    } catch {
      // user cancelled — no-op
    }
  };

  const topPadding = Platform.OS === "web" ? 16 : insets.top + 8;
  const bottomPadding = Platform.OS === "web" ? 24 : insets.bottom + 24;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.iconBtn, { borderColor: colors.border }]}
          hitSlop={8}
          accessibilityLabel="Close"
        >
          <Icon name="x" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Echo
        </Text>
        <TouchableOpacity
          onPress={onShare}
          disabled={!pair}
          style={[
            styles.iconBtn,
            { borderColor: colors.border, opacity: pair ? 1 : 0.4 },
          ]}
          hitSlop={8}
          accessibilityLabel="Share"
        >
          <Icon name="share" size={18} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !pair ? (
        <View style={styles.center}>
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>
            This echo isn't available right now.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.body,
            { paddingBottom: bottomPadding },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* The big "It's an Echo!" reveal headline. This screen is
              the celebration moment — both when arriving from the
              EchoFlash banner AND when tapping a pair from inbox /
              Discover — so it gets the same treatment as a dating-app
              "It's a Match!" reveal. */}
          <View style={styles.revealBlock}>
            <Text style={[styles.revealEyebrow, { color: colors.gold }]}>
              ✨ ECHO ✨
            </Text>
            <Text style={[styles.revealTitle, { color: colors.foreground }]}>
              It's an Echo!
            </Text>
            <Text style={[styles.theme, { color: colors.mutedForeground }]}>
              {pair.a.theme || pair.b.theme || "shared moment"}
            </Text>
            {pair.mutualAt && (
              <Text style={[styles.mutualAt, { color: colors.mutedForeground }]}>
                matched {ago(pair.mutualAt)}
              </Text>
            )}
          </View>

          <View style={styles.pairColumn}>
            {/* Neutral country-only labelling: this view is opened both
                from the user's own inbox AND from public Discover theme
                tiles, so we never assert "yours" vs "theirs". The flag +
                country line is enough context. */}
            <PairSide side={pair.a} />
            <View
              style={[
                styles.divider,
                { backgroundColor: colors.border },
              ]}
            />
            <PairSide side={pair.b} />
          </View>

          {sharedTags.length > 0 && (
            <View style={styles.detailBlock}>
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
                Shared vibes
              </Text>
              <View style={styles.tagRow}>
                {sharedTags.map((t) => (
                  <View
                    key={t}
                    style={[
                      styles.tagChip,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.tagText, { color: colors.foreground }]}>
                      {t}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity
            onPress={onShare}
            style={[
              styles.shareBtn,
              { backgroundColor: colors.primary },
            ]}
            activeOpacity={0.85}
          >
            <Icon name="share" size={18} color={colors.primaryForeground} />
            <Text
              style={[styles.shareBtnText, { color: colors.primaryForeground }]}
            >
              Share this echo
            </Text>
          </TouchableOpacity>

          <Text style={[styles.footer, { color: colors.mutedForeground }]}>
            Two strangers, same vibe.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function PairSide({ side }: { side: PhotoPairSide }) {
  const colors = useColors();
  return (
    <View style={styles.side}>
      <View style={styles.bigPhotoWrap}>
        <Image source={{ uri: side.uri }} style={styles.bigPhoto} />
        {side.customAudioUrl ? (
          <View style={styles.micBadgeOverlay}>
            <MicBadge audioUrl={side.customAudioUrl} size="sm" />
          </View>
        ) : null}
      </View>
      <View style={styles.sideMeta}>
        <Text style={styles.flag}>{side.countryFlag}</Text>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.country, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {side.country}
          </Text>
          {side.createdAt && (
            <Text
              style={[styles.posted, { color: colors.mutedForeground }]}
              numberOfLines={1}
            >
              posted {ago(side.createdAt)}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { fontSize: 13, fontFamily: "Inter_400Regular" },
  scroll: { flex: 1 },
  body: {
    paddingHorizontal: 20,
    gap: 18,
    flexGrow: 1,
  },
  revealBlock: {
    alignItems: "center",
    gap: 6,
    paddingTop: 4,
  },
  revealEyebrow: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 3,
  },
  revealTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  theme: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "center",
    marginTop: 4,
  },
  mutualAt: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  pairColumn: { gap: 14 },
  side: { gap: 10 },
  bigPhotoWrap: { position: "relative" },
  bigPhoto: { width: "100%", aspectRatio: 1, borderRadius: 18 },
  micBadgeOverlay: { position: "absolute", bottom: 10, left: 10 },
  sideMeta: { flexDirection: "row", alignItems: "center", gap: 12 },
  flag: { fontSize: 26 },
  country: { fontSize: 15, fontFamily: "Inter_700Bold" },
  posted: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  divider: { height: 1, marginHorizontal: 40 },
  detailBlock: { gap: 8 },
  detailLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  tagText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 4,
  },
  shareBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  footer: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
  },
});
